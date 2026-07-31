import chalk from "chalk";
import type {
	GuildBasedChannel,
	GuildMember,
	NewsChannel,
	PrivateThreadChannel,
	PublicThreadChannel,
	TextChannel,
} from "discord.js";
import ollama from "ollama";
import { prisma } from "prisma/db";
import type { discordClient as DiscordClient } from "@/discord/discord-service";
import { OllamaCloudClient } from "@/llm-apis/ollama-cloud-api/ollamaCloudClient";
import type {
	TextBasedChannel,
	WelcomeServiceConfig,
} from "../types/welcome.types";
import { promptV2 } from "./prompt.v2";

let cachedWelcomePrompt: string | null = null;
/**
 * Service for handling welcome messages when new members join a server.
 * Listens to guildMemberAdd events and sends welcome messages to a configured channel.
 */
export class WelcomeService {
	private readonly discordClient: typeof DiscordClient;
	private readonly targetChannelId: string;
	private readonly useLLM: boolean;
	private readonly customTemplate: string | null;
	private readonly ollamaCloudClient: OllamaCloudClient;

	constructor(
		discordClient: typeof DiscordClient,
		config: WelcomeServiceConfig = { targetChannelId: "772837999809265728" },
	) {
		this.discordClient = discordClient;
		this.targetChannelId = config.targetChannelId || "772837999809265728";
		this.useLLM = config.useLLM || false;
		this.customTemplate = config.customTemplate || null;
		const ollamaCloudBaseUrl = process.env.OLLAMA_BASE_URL;
		if (!ollamaCloudBaseUrl) {
			throw new Error(
				"Missing required parameters process.env.OLLAMA_BASE_URL.",
			);
		}
		this.ollamaCloudClient = new OllamaCloudClient({
			baseUrl: ollamaCloudBaseUrl,
		});
	}

	async handleNewMember(member: GuildMember): Promise<void> {
		try {
			// Skip if member is a bot
			if (member.user?.bot) {
				this.cLog.skippedBot(member.user?.tag || member.id);
				return;
			}

			// Skip if member is pending verification
			// if (member.pending) {
			// 	this.cLog.skippedPendingMember(member.user?.tag || member.id);
			// 	return;
			// }

			this.cLog.newMemberJoined(
				member.user?.tag || member.user?.username || member.id,
			);

			let targetChannel: TextBasedChannel | null = null;
			const channelResult = await this.getValidatedChannel(member);

			if (channelResult.channel) {
				targetChannel = channelResult.channel;
			} else {
				if (channelResult.error) {
					switch (channelResult.error.type) {
						case "NOT_FOUND":
							this.cLog.channelNotFound(this.targetChannelId);
							break;
						case "NOT_TEXT_BASED":
							this.cLog.channelNotTextBased(this.targetChannelId);
							break;
						case "GUILD_MISMATCH":
							this.cLog.channelGuildMismatch(
								this.targetChannelId,
								member.guild.id,
							);
							break;
						case "ARCHIVED":
							this.cLog.channelArchived(this.targetChannelId);
							break;
					}
				}
				console.log(
					"[WelcomeService] Configured channel invalid or mismatched. Finding fallback...",
				);
				targetChannel = this.getFallbackChannel(member);
			}

			if (!targetChannel) {
				this.cLog.error(
					"handleNewMember",
					new Error(
						`No writable text channel found in guild ${member.guild.name}`,
					),
				);
				return;
			}

			const welcomeMessage = await this.generateWelcomeMessage(member);
			if (welcomeMessage) {
				await targetChannel.send({ content: welcomeMessage });
				this.cLog.welcomeSent(member.user?.tag || member.id);
			}
		} catch (error) {
			this.handleError("handleNewMember", error, member);
		}
	}

	/**
	 * Get and validate the target channel for sending welcome messages
	 */
	private async getValidatedChannel(member: GuildMember): Promise<{
		channel: TextBasedChannel | null;
		error?: {
			type: "NOT_FOUND" | "NOT_TEXT_BASED" | "GUILD_MISMATCH" | "ARCHIVED";
			message: string;
		};
	}> {
		try {
			const channel = await this.discordClient.channels.fetch(
				this.targetChannelId,
			);

			if (!channel) {
				return {
					channel: null,
					error: {
						type: "NOT_FOUND",
						message: `Channel ${this.targetChannelId} not found`,
					},
				};
			}

			// Check if channel is in the same guild as the member
			const guildChannel = channel as GuildBasedChannel;
			if (guildChannel.guildId && guildChannel.guildId !== member.guild.id) {
				return {
					channel: null,
					error: {
						type: "GUILD_MISMATCH",
						message: `Channel ${this.targetChannelId} is not in guild ${member.guild.id}`,
					},
				};
			}

			// Check if channel is text-based
			if (!this.isTextBasedChannel(channel)) {
				return {
					channel: null,
					error: {
						type: "NOT_TEXT_BASED",
						message: `Channel ${this.targetChannelId} is not text-based`,
					},
				};
			}

			// Check if thread is archived
			if (this.isThreadChannel(channel) && (channel as any).archived) {
				return {
					channel: null,
					error: {
						type: "ARCHIVED",
						message: `Thread ${this.targetChannelId} is archived`,
					},
				};
			}

			return { channel: channel as TextBasedChannel };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Discord error code 10003 = Unknown Channel
			if (
				errorMessage.includes("Unknown Channel") ||
				errorMessage.includes("10003")
			) {
				return {
					channel: null,
					error: { type: "NOT_FOUND", message: errorMessage },
				};
			}

			return {
				channel: null,
				error: { type: "NOT_FOUND", message: errorMessage },
			};
		}
	}

	/**
	 * Find a fallback text channel to welcome the member
	 */
	private getFallbackChannel(member: GuildMember): TextBasedChannel | null {
		if (member.guild.systemChannel) {
			const systemChannel = member.guild.systemChannel;
			const permissions = systemChannel.permissionsFor(
				member.guild.members.me!,
			);
			if (permissions && permissions.has("SendMessages")) {
				return systemChannel as any;
			}
		}

		const textChannel = member.guild.channels.cache.find(
			(channel) =>
				channel.isTextBased() &&
				!channel.isThread() &&
				channel.permissionsFor(member.guild.members.me!)?.has("SendMessages"),
		);

		return (textChannel as any) || null;
	}

	/**
	 * Check if a channel is text-based (can send messages)
	 */
	private isTextBasedChannel(channel: any): channel is TextBasedChannel {
		const textChannelTypes = [
			"GUILD_TEXT",
			"GUILD_NEWS",
			"GUILD_PUBLIC_THREAD",
			"GUILD_PRIVATE_THREAD",
			"GUILD_NEWS_THREAD",
		];
		return true; // channel type is 0; what is this
		// return textChannelTypes.includes(channel.type);
	}

	/**
	 * Check if a channel is a thread channel
	 */
	private isThreadChannel(channel: any): boolean {
		const threadTypes = [
			"GUILD_PUBLIC_THREAD",
			"GUILD_PRIVATE_THREAD",
			"GUILD_NEWS_THREAD",
		];
		return threadTypes.includes(channel.type);
	}

	/**
	 * Generate welcome message for new member
	 */
	async generateWelcomeMessage(member: GuildMember): Promise<string | null> {
		if (!cachedWelcomePrompt) {
			const promptRecord = await prisma.prompt.findFirst({
				where: { category: "WELCOME_MESSAGE" },
				orderBy: { createdAt: "desc" },
			});
			if (promptRecord) {
				cachedWelcomePrompt = promptRecord.promptValue;
			}
		}

		if (!cachedWelcomePrompt) {
			this.cLog.error(
				"generateWelcomeMessage",
				new Error("No WELCOME_MESSAGE prompt found in DB."),
			);
			return null;
		}

		const userMention = `<@${member.id}>`;
		const baseTemplate =
			this.customTemplate ||
			`A new user just joined the server! Give them a funny, lighthearted welcome. NEW USER DISCORD ID: {{discord_id}}`;
		const welcomeContent = baseTemplate.replace("{{discord_id}}", userMention);

		// Use the OLLAMA_CHAT_MODEL from environment variables if present
		const model = process.env.OLLAMA_CHAT_MODEL || "nemotron-3-ultra:cloud";

		const response = await this.ollamaCloudClient.chat({
			model,
			messages: [
				{
					role: "system",
					content: cachedWelcomePrompt,
				},
				{
					role: "user",
					content: welcomeContent,
				},
			],
		});

		return response.status === "failed" ? null : response.content;
	}

	/**
	 * Handle errors with appropriate logging
	 */
	private handleError(
		action: string,
		error: unknown,
		member?: GuildMember,
	): void {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const memberTag = member?.user?.tag || member?.id || "unknown";

		// Handle specific Discord errors
		if (
			errorMessage.includes("Missing Permissions") ||
			errorMessage.includes("50013")
		) {
			this.cLog.error(`Missing Permissions for ${memberTag}`, error);
		} else if (
			errorMessage.includes("Unknown Channel") ||
			errorMessage.includes("10003")
		) {
			this.cLog.error(`Channel Not Found for ${memberTag}`, error);
		} else if (
			errorMessage.includes("Unknown Member") ||
			errorMessage.includes("10007")
		) {
			this.cLog.error(`Member Left Before Welcome for ${memberTag}`, error);
		} else if (
			errorMessage.includes("Cannot send messages to this user") ||
			errorMessage.includes("50007")
		) {
			this.cLog.error(`Cannot Send Messages for ${memberTag}`, error);
		} else if (
			errorMessage.includes("rate limit") ||
			errorMessage.includes("429")
		) {
			this.cLog.error(`Rate Limited for ${memberTag}`, error);
		} else if (
			errorMessage.includes("ECONNRESET") ||
			errorMessage.includes("ETIMEDOUT") ||
			errorMessage.includes("ENOTFOUND")
		) {
			this.cLog.error(`Network Error for ${memberTag}`, error);
		} else {
			this.cLog.error(`${action} for ${memberTag}`, error);
		}
	}

	/**
	 * Console log helpers for service events
	 */
	get cLog() {
		return {
			newMemberJoined: (userTag: string) =>
				console.log(
					chalk.bgGreen.bold.white("[Welcome-Service]"),
					`: New member joined: ${userTag}`,
				),
			welcomeSent: (userTag: string) =>
				console.log(
					chalk.bgGreen.bold.white("[Welcome-Service]"),
					`: Welcome message sent for ${userTag}`,
				),
			channelNotFound: (channelId: string) =>
				console.log(
					chalk.bgYellow.bold.black("[Welcome-Service]"),
					`: Target channel not found: ${channelId}`,
				),
			channelNotTextBased: (channelId: string) =>
				console.log(
					chalk.bgYellow.bold.black("[Welcome-Service]"),
					`: Target channel is not text-based: ${channelId}`,
				),
			channelGuildMismatch: (channelId: string, guildId: string) =>
				console.log(
					chalk.bgYellow.bold.black("[Welcome-Service]"),
					`: Channel ${channelId} not in guild ${guildId}`,
				),
			channelArchived: (channelId: string) =>
				console.log(
					chalk.bgYellow.bold.black("[Welcome-Service]"),
					`: Target thread is archived: ${channelId}`,
				),
			skippedBot: (userTag: string) =>
				console.log(
					chalk.bgBlue.bold.white("[Welcome-Service]"),
					`: Skipped bot: ${userTag}`,
				),
			skippedPendingMember: (userTag: string) =>
				console.log(
					chalk.bgBlue.bold.white("[Welcome-Service]"),
					`: Skipped pending member: ${userTag}`,
				),
			error: (action: string, error: any) =>
				console.error(
					chalk.bgRed.bold.white("[Welcome-Service]"),
					`: Error in ${action}:`,
					error,
				),
		};
	}
}

/**
 * Default configuration for WelcomeService
 * Uses DUMMY_CHANNEL_ID as placeholder - user must replace with actual channel ID
 */
export const defaultWelcomeConfig: WelcomeServiceConfig = {
	targetChannelId: "DUMMY_CHANNEL_ID",
	useLLM: false,
};
