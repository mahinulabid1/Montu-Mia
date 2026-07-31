import type { GuildMember, Message } from "discord.js";
import pino from "pino";
import { prisma } from "prisma/db";
import { promptV2 } from "@/discord/chaos-chat/v1/modules/prompt.v2";
import type { discordClient as DiscordClient } from "@/discord/discord-service";
import { OllamaCloudClient } from "@/llm-apis/ollama-cloud-api/ollamaCloudClient";
import {
	type ChatMessage,
	messageHistoryServiceV2,
} from "./modules/message-history.service";
import { MessageQueueService } from "./modules/message-queue.service";
import { WelcomeService } from "./modules/welcome.service";
import { standardToolRegistry, type ToolRegistry } from "./tools";
import type { IChaosChatProcessor } from "./types/queue.types";

const logger = pino({ name: "chaos-chat-service" });

export class ChaosChatV1 implements IChaosChatProcessor {
	private readonly discordAppId = process.env.DISCORD_APPLICATION_ID;
	private readonly discordClient: typeof DiscordClient;
	private readonly toolRegistry: ToolRegistry;
	private readonly queueService: MessageQueueService;
	private readonly welcomeService: WelcomeService;
	private readonly ollamaCloudClient: OllamaCloudClient;

	private cachedChaosChatPrompt: string | null = null;
	private lastPromptFetch = 0;
	private readonly PROMPT_TTL_MS = 5 * 60 * 1000; // 5 minutes

	constructor(
		discordClient: typeof DiscordClient,
		toolRegistry: ToolRegistry = standardToolRegistry,
	) {
		this.discordClient = discordClient;
		this.toolRegistry = toolRegistry;
		const ollamaCloudBaseUrl = process.env.OLLAMA_BASE_URL;
		if (!ollamaCloudBaseUrl) {
			throw new Error(
				"Missing required parameters process.env.OLLAMA_BASE_URL. set up in environment variables.",
			);
		}
		this.ollamaCloudClient = new OllamaCloudClient({
			baseUrl: ollamaCloudBaseUrl,
		});

		// Initialize queue service with a clean decoupled callback contract
		this.queueService = new MessageQueueService(async (message) => {
			await this.processMessage(message);
		});

		// Get target welcome channel ID from env, falling back to default
		const welcomeChannelId =
			process.env.WELCOME_CHANNEL_ID || "772837999809265728";
		this.welcomeService = new WelcomeService(discordClient, {
			useLLM: true,
			targetChannelId: welcomeChannelId,
		});
	}

	/**
	 * Public event handler for new messages (called by the Discord gateway layer)
	 */
	async handleMessage(message: Message): Promise<void> {
		if (!this.shouldReply(message)) return;
		this.cLog.mentionedBot();

		// Enqueue the message for sequential processing
		this.queueService.enqueue(message);
	}

	/**
	 * Public event handler for new guild members (called by the Discord gateway layer)
	 */
	async handleWelcome(member: GuildMember): Promise<void> {
		await this.welcomeService.handleNewMember(member);
	}

	/**
	 * Resolves the user reply target metadata with cache checks and error handling
	 */
	private async resolveReplyTarget(
		message: Message,
	): Promise<ChatMessage["replyTo"]> {
		if (!message.reference?.messageId) {
			return null;
		}
		const channelId = message.channelId;
		const cached = messageHistoryServiceV2
			.getRawHistory(channelId)
			.find((m) => m.messageId === message.reference?.messageId);

		if (cached) {
			return {
				messageId: cached.messageId,
				authorId: cached.authorId,
				authorName: cached.authorName,
			};
		}

		// Try fetching the message from the channel with a timeout
		try {
			const fetchPromise = message.channel.messages.fetch(
				message.reference.messageId,
			);
			const timeoutPromise = new Promise<null>((_, reject) =>
				setTimeout(() => reject(new Error("Fetch timeout")), 2000),
			);
			const refMessage = await Promise.race([fetchPromise, timeoutPromise]);

			if (refMessage) {
				return {
					messageId: refMessage.id,
					authorId: refMessage.author.id,
					authorName:
						refMessage.member?.displayName ||
						refMessage.author.displayName ||
						refMessage.author.username,
				};
			}
		} catch (err) {
			logger.warn(
				`[ChaosChatV1] Failed to resolve reply target ${message.reference.messageId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		// Return a generic fallback target if the fetch fails but reference exists
		return {
			messageId: message.reference.messageId,
			authorId: "unknown",
			authorName: "Unknown User",
		};
	}

	/**
	 * Converts the generated reply's @DisplayName mentions back to <@UserId> format
	 */
	private convertMentionsToIds(
		text: string,
		channelId: string,
		message: Message,
		currentReplyTo: ChatMessage["replyTo"],
	): string {
		const messages = messageHistoryServiceV2.getRawHistory(channelId);
		const userMap = new Map<string, string>();

		// 1. Map current user
		const senderName =
			message.member?.displayName ||
			message.author.displayName ||
			message.author.username;
		userMap.set(senderName, message.author.id);

		// 2. Map current reply target
		if (currentReplyTo && currentReplyTo.authorId !== "unknown") {
			userMap.set(currentReplyTo.authorName, currentReplyTo.authorId);
		}

		// 3. Map history users and their reply targets
		for (const msg of messages) {
			userMap.set(msg.authorName, msg.authorId);
			if (msg.replyTo && msg.replyTo.authorId !== "unknown") {
				userMap.set(msg.replyTo.authorName, msg.replyTo.authorId);
			}
		}

		if (userMap.size === 0) return text;

		// Sort names by length descending to match longest matches first
		const displayNames = Array.from(userMap.keys()).sort(
			(a, b) => b.length - a.length,
		);

		const escapeRegex = (str: string) =>
			str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		let result = text;
		for (const name of displayNames) {
			const userId = userMap.get(name) ?? "";
			const escapedName = escapeRegex(name);
			// Match "@Name" but prevent matching sub-strings or word boundary mismatches
			const regex = new RegExp(`(?<!\\w)@${escapedName}(?!\\w)`, "g");
			result = result.replace(regex, `<@${userId}>`);
		}
		return result;
	}

	/**
	 * Sequential processing logic executed by the MessageQueueService
	 */
	private async processMessage(message: Message): Promise<void> {
		let replyMessage = await this.generateReply(message);

		if (!replyMessage) {
			logger.info(
				"[ChaosChatV1] No reply generated (offline/failed). Skipping.",
			);
			return;
		}

		replyMessage = this.sanitizeReply(replyMessage);

		// Resolve user reply targets first before adding user message to history
		const userReplyTo = await this.resolveReplyTarget(message);
		const userAuthorName =
			message.member?.displayName ||
			message.author.displayName ||
			message.author.username;

		// Add current user message to message history (isolated by channelId)
		messageHistoryServiceV2.addMessage(message.channelId, {
			messageId: message.id,
			role: "user",
			content: this.sanitizeMessage(message.content),
			authorId: message.author.id,
			authorName: userAuthorName,
			replyTo: userReplyTo,
		});

		// Convert mentions in LLM response back to Discord <@ID> tags
		const finalReplyMessage = this.convertMentionsToIds(
			replyMessage,
			message.channelId,
			message,
			userReplyTo,
		);

		// Split generated replies exceeding the 2000-character limit to avoid API exceptions
		const chunks = this.splitMessage(finalReplyMessage, 2000);
		let sentMessage: Message | undefined;
		for (const chunk of chunks) {
			sentMessage = await message.reply(chunk);
		}
		this.cLog.replySent();

		// Add assistant response to message history
		if (sentMessage) {
			const botDisplayName =
				message.guild?.members.me?.displayName ||
				message.client.user?.displayName ||
				message.client.user?.username ||
				"Montu Mia";

			messageHistoryServiceV2.addMessage(message.channelId, {
				messageId: sentMessage.id,
				role: "assistant",
				content: finalReplyMessage,
				authorId: sentMessage.author.id,
				authorName: botDisplayName,
				replyTo: {
					messageId: message.id,
					authorId: message.author.id,
					authorName: userAuthorName,
				},
			});
		}
	}

	/**
	 * Splits text into chunks below the specified character limit
	 */
	private splitMessage(text: string, limit = 2000): string[] {
		if (text.length <= limit) return [text];
		const chunks: string[] = [];
		let remaining = text;

		while (remaining.length > 0) {
			if (remaining.length <= limit) {
				chunks.push(remaining);
				break;
			}
			let splitIndex = remaining.lastIndexOf("\n", limit);
			if (splitIndex === -1 || splitIndex < limit * 0.8) {
				splitIndex = remaining.lastIndexOf(" ", limit);
			}
			if (splitIndex === -1 || splitIndex < limit * 0.8) {
				splitIndex = limit;
			}
			chunks.push(remaining.substring(0, splitIndex).trim());
			remaining = remaining.substring(splitIndex).trim();
		}
		return chunks;
	}

	/**
	 * Get the tool registry
	 */
	getToolRegistry(): ToolRegistry {
		return this.toolRegistry;
	}

	/**
	 * Removes self-mentions generated by the LLM
	 */
	sanitizeReply(message: string): string {
		const botId = this.discordClient.user?.id || this.discordAppId;
		if (!botId) return message;
		// Matches standard <@botId> and nickname <@!botId> mention formats
		const mentionRegex = new RegExp(`<@!?${botId}>`, "g");
		return message.replace(mentionRegex, "").trim();
	}

	/**
	 * LLM tool requirement analysis check
	 */
	async understand(
		message: Message,
	): Promise<{ shouldCall: boolean; toolName: string | null }> {
		const model =
			process.env.OLLAMA_TOOL_MODEL || "krishairnd/Gemma-4-Uncensored:latest";
		const systemContent =
			promptV2.generateToolRequirement ||
			"Determine if a tool call is required. Reply only with 'yes <tool_name>' or 'no'.";

		const response = await this.ollamaCloudClient.chat({
			model,
			messages: [
				{ role: "system", content: systemContent },
				{
					role: "user",
					content: `
          <message role="user">
            <content>
             ${this.sanitizeMessage(message.content)}
             </content>
          </message>
          `,
				},
			],
		});

		if (response.status === "failed" || !response.content) {
			logger.info(
				"[ChaosChatV1] Tool understanding failed or returned empty response.",
			);
			return { shouldCall: false, toolName: null };
		}

		// Sanitize LLM response by trimming whitespace and stripping common punctuation
		const cleanResponse = response.content
			.trim()
			.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
		const arr = cleanResponse.split(/\s+/);

		logger.info(`[ChaosChatV1] Cleaned tool response: ${cleanResponse}`);

		if (arr.length === 1 && arr[0].toLowerCase() === "no") {
			return { shouldCall: false, toolName: null };
		}
		if (arr.length === 2 && arr[0].toLowerCase() === "yes") {
			return { shouldCall: true, toolName: arr[1] };
		}
		return { shouldCall: false, toolName: null };
	}

	private shouldReply(message: Message): boolean {
		const botId = this.discordClient.user?.id || this.discordAppId;
		if (!botId) return false;
		const mentionedBot = message.mentions.has(botId);
		return mentionedBot && message.author.id !== botId;
	}

	/**
	 * Retrieve Chaos Chat system prompt with TTL cache validation
	 */
	private async getSystemPrompt(): Promise<string | null> {
		const now = Date.now();
		if (
			!this.cachedChaosChatPrompt ||
			now - this.lastPromptFetch > this.PROMPT_TTL_MS
		) {
			logger.info("[ChaosChatV1] Fetching system prompt from database...");
			const promptRecord = await prisma.prompt.findFirst({
				where: { category: "CHAOS_CHAT" },
				orderBy: { createdAt: "desc" },
			});
			if (promptRecord) {
				this.cachedChaosChatPrompt = promptRecord.promptValue;
				this.lastPromptFetch = now;
			}
		}

		return this.cachedChaosChatPrompt;
	}

	private formatTimestamp(date: Date): string {
		const pad = (n: number) => n.toString().padStart(2, "0");
		const yyyy = date.getFullYear();
		const mm = pad(date.getMonth() + 1);
		const dd = pad(date.getDate());
		const hh = pad(date.getHours());
		const min = pad(date.getMinutes());
		const ss = pad(date.getSeconds());
		return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
	}

	async generateReply(message: Message): Promise<string | null> {
		const systemPrompt = await this.getSystemPrompt();
		if (!systemPrompt) {
			logger.error(
				"[ChaosChatV1] No CHAOS_CHAT prompt found in DB. Stopping message generation.",
			);
			return null;
		}

		const sanitizedMessage = this.sanitizeMessage(message.content);
		const messageHistory = messageHistoryServiceV2.getHistoryPrompt(
			message.channelId,
		);
		const model = process.env.OLLAMA_CHAT_MODEL || "nemotron-3-ultra:cloud";

		const currentReplyTo = await this.resolveReplyTarget(message);
		const currentReplyPart = currentReplyTo
			? ` replying to ${currentReplyTo.authorName}`
			: "";
		const currentTimestamp = this.formatTimestamp(new Date());

		const userAuthorName =
			message.member?.displayName ||
			message.author.displayName ||
			message.author.username;

		const currentMessageLine = `[${currentTimestamp}] ${userAuthorName} (ID: ${message.author.id})${currentReplyPart}: ${sanitizedMessage}`;

		const enrichedSystemPrompt = `
${systemPrompt}

REPLY & MENTION HANDLING RULES (STRICT):
- Always use the EXACT display name from history when addressing users (e.g. "Alice" not "user_123").
- To mention a user, use @ followed by their display name (e.g. "@Alice").
- Never invent user IDs or display names—only reference those visible in the history or current query.
- If a message says "replying to [User]", treat it as a direct response to THAT user's message.
- Pronouns like "it", "this", "that" in replies refer to the REPLIED-TO message's content.
- When addressing a reply, acknowledge both the replier AND the original speaker if relevant.
- Never ignore reply context—it defines the conversation's focus.
`;

		const userPromptContent = `
Conversation history:
${messageHistory || "(No prior conversation)"}

Current user query:
${currentMessageLine}

Your response:
`;

		const response = await this.ollamaCloudClient.chat({
			model,
			messages: [
				{
					role: "system",
					content: enrichedSystemPrompt,
				},
				{
					role: "user",
					content: userPromptContent,
				},
			],
		});

		if (response.status === "failed" || !response.content) {
			logger.info("[ChaosChatV1] Failed to generate reply. Silently ignoring.");
			return null;
		}

		return response.content;
	}

	/**
	 * Sanitizes user-sent messages by removing the bot mention
	 */
	sanitizeMessage(message: string): string {
		const botId = this.discordClient.user?.id || this.discordAppId;
		if (!botId) return message.trim();
		const mentionRegex = new RegExp(`<@!?${botId}>`, "g");
		return message.replace(mentionRegex, "").trim();
	}

	/* console log helper */
	get cLog() {
		return {
			mentionedBot: () =>
				logger.info("[Message-Service]: Someone mentioned the bot"),
			replySent: () => logger.info("[Message-Service]: Reply Message Sent"),
			toolCalled: (toolName: string) =>
				logger.info(`[Tool-Registry]: Tool "${toolName}" called`),
		};
	}
}
