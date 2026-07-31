import pino from "pino";

const logger = pino({ name: "message-history-service" });

export interface ChatMessage {
	id: number;
	messageId: string;
	role: "user" | "assistant";
	timestamp: string;
	content: string;
	authorId: string;
	authorName: string;
	replyTo?: {
		messageId: string;
		authorId: string;
		authorName: string;
	} | null;
}

class MessageHistoryService {
	private histories = new Map<string, ChatMessage[]>();
	private readonly MAX_HISTORY_LENGTH = 10;
	private readonly MAX_HISTORY_AGE_MS = 10 * 60 * 1000; // 10 minutes

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

	/**
	 * Prunes messages older than 10 minutes and re-indexes the remaining ones
	 */
	private pruneExpiredMessages(channelId: string): void {
		const currentMessages = this.histories.get(channelId);
		if (!currentMessages || currentMessages.length === 0) return;

		const now = Date.now();
		const validMessages = currentMessages.filter(
			(msg) =>
				now - new Date(msg.timestamp).getTime() <= this.MAX_HISTORY_AGE_MS,
		);

		if (validMessages.length !== currentMessages.length) {
			if (validMessages.length === 0) {
				this.histories.delete(channelId);
				logger.info(
					`[MessageHistory] All messages expired and cleared for channel ${channelId}`,
				);
			} else {
				const reindexed = validMessages.map((msg, index) => ({
					...msg,
					id: index + 1,
				}));
				this.histories.set(channelId, reindexed);
				logger.info(
					`[MessageHistory] Pruned ${currentMessages.length - validMessages.length} expired messages for channel ${channelId}. Remaining: ${validMessages.length}`,
				);
			}
		}
	}

	public addMessage(
		channelId: string,
		params: {
			messageId: string;
			role: "user" | "assistant";
			content: string;
			authorId: string;
			authorName: string;
			replyTo?: ChatMessage["replyTo"];
		},
	): void {
		// Prune expired messages first
		this.pruneExpiredMessages(channelId);
		const currentMessages = this.histories.get(channelId) ?? [];

		const newId = currentMessages.length + 1;
		const timestamp = new Date().toISOString();
		const newMessage: ChatMessage = {
			id: newId,
			messageId: params.messageId,
			role: params.role,
			timestamp,
			content: params.content,
			authorId: params.authorId,
			authorName: params.authorName,
			replyTo: params.replyTo,
		};

		let updatedMessages: ChatMessage[];

		if (currentMessages.length >= this.MAX_HISTORY_LENGTH) {
			updatedMessages = [...currentMessages.slice(1), newMessage];
			updatedMessages = updatedMessages.map((msg, index) => ({
				...msg,
				id: index + 1,
			}));
		} else {
			updatedMessages = [...currentMessages, newMessage];
		}

		this.histories.set(channelId, updatedMessages);
		logger.info(
			`[MessageHistory] Updated history for channel ${channelId}. Count: ${updatedMessages.length}`,
		);
	}

	public getHistoryPrompt(channelId: string): string {
		// Prune expired messages first
		this.pruneExpiredMessages(channelId);
		const messages = this.histories.get(channelId) ?? [];
		if (messages.length === 0) {
			return "";
		}

		return messages
			.map((msg) => {
				const timestampStr = this.formatTimestamp(new Date(msg.timestamp));
				const replyPart = msg.replyTo
					? ` replying to ${msg.replyTo.authorName}`
					: "";
				return `[${timestampStr}] ${msg.authorName} (ID: ${msg.authorId})${replyPart}: ${msg.content}`;
			})
			.join("\n");
	}

	public getRawHistory(channelId: string): ChatMessage[] {
		// Prune expired messages first
		this.pruneExpiredMessages(channelId);
		return this.histories.get(channelId) ?? [];
	}

	public clear(channelId?: string): void {
		if (channelId) {
			this.histories.delete(channelId);
			logger.info(`[MessageHistory] Cleared history for channel ${channelId}`);
		} else {
			this.histories.clear();
			logger.info("[MessageHistory] Cleared all channel histories");
		}
	}
}

export const messageHistoryServiceV2 = new MessageHistoryService();
