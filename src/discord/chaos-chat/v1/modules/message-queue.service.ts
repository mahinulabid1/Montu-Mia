import type { Message } from "discord.js";
import type { QueueMessage } from "../types/queue.types";

/**
 * Service for managing message queue and sequential processing
 */
export class MessageQueueService {
	private queue: QueueMessage[] = [];
	private isProcessing = false;
	private processedMessageIds = new Map<string, number>(); // messageId -> timestamp
	private readonly MAX_QUEUE_AGE_MS = 5 * 60 * 1000; // 5 minutes max wait time
	private typingInterval: NodeJS.Timeout | null = null;
	private currentTypingMessage: Message | null = null;
	private stopTypingFlag = false;

	constructor(
		private readonly processCallback: (message: Message) => Promise<void>,
	) {}

	/**
	 * Add a message to the queue for processing
	 */
	enqueue(message: Message): void {
		const now = Date.now();
		// Cleanup old message IDs periodically on enqueue
		this.cleanupOldMessageIds(now);

		// Prevent duplicate processing
		if (this.processedMessageIds.has(message.id)) {
			console.log(
				"[MessageQueue] Duplicate message detected, skipping:",
				message.id,
			);
			return;
		}

		const queueItem: QueueMessage = {
			message,
			enqueuedAt: now,
		};

		this.processedMessageIds.set(message.id, now);
		this.queue.push(queueItem);

		console.log(
			"[MessageQueue] Message enqueued:",
			message.id,
			"Queue size:",
			this.queue.length,
		);
		this.processNext();
	}

	/**
	 * Process the next item in the queue
	 */
	private async processNext(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) {
			return;
		}

		this.isProcessing = true;
		const item = this.queue.shift()!;

		try {
			// Check if message is too old
			if (this.isMessageTooOld(item)) {
				console.log(
					"[MessageQueue] Message too old, skipping:",
					item.message.id,
				);
				return;
			}

			await this.processItem(item);
		} catch (error) {
			console.error(
				"[MessageQueue] Error processing message:",
				item.message.id,
				error,
			);
			// Notify user about the error
			try {
				await this.trySendToChannel(item.message, {
					content: "⚠️ Error processing your message. Please try again later.",
				});
			} catch (sendError) {
				console.error(
					"[MessageQueue] Failed to send error notification:",
					sendError,
				);
			}
		} finally {
			this.isProcessing = false;
			// Always continue to next item
			this.processNext();
		}
	}

	/**
	 * Check if a queued message has been waiting too long
	 */
	private isMessageTooOld(item: QueueMessage): boolean {
		const age = Date.now() - item.enqueuedAt;
		return age > this.MAX_QUEUE_AGE_MS;
	}

	/**
	 * Process a single queue item
	 */
	private async processItem(item: QueueMessage): Promise<void> {
		const { message } = item;

		// Check if message is partial (not fully loaded, possibly deleted)
		if (message.partial) {
			console.log("[MessageQueue] Skipping partial message:", message.id);
			return;
		}

		// Check if we can access the channel
		if (!message.channel) {
			console.log("[MessageQueue] No channel for message:", message.id);
			return;
		}

		try {
			this.startTyping(message);
			// Delegate the actual reply generation and history saving to ChaosChatV1 via the callback
			await this.processCallback(message);
			console.log(
				"[MessageQueue] Message callback processed successfully:",
				message.id,
			);
		} catch (error) {
			console.error(
				"[MessageQueue] Callback failed inside processItem:",
				message.id,
				error,
			);
			throw error; // Re-throw to be caught by processNext's try-catch
		} finally {
			this.stopTyping();
		}
	}

	/**
	 * Start continuous typing indicator for a message
	 * Refreshes every 8 seconds to keep indicator visible
	 */
	private startTyping(message: Message): void {
		this.stopTyping();
		this.stopTypingFlag = false;
		this.currentTypingMessage = message;

		const refreshTyping = async () => {
			if (this.stopTypingFlag) return;
			if (!this.currentTypingMessage?.channel) {
				this.stopTyping();
				return;
			}
			await this.trySendTyping(this.currentTypingMessage);
		};

		refreshTyping();
		this.typingInterval = setInterval(refreshTyping, 8000);
	}

	/**
	 * Stop the continuous typing indicator
	 */
	private stopTyping(): void {
		this.stopTypingFlag = true;
		if (this.typingInterval) {
			clearInterval(this.typingInterval);
			this.typingInterval = null;
		}
		this.currentTypingMessage = null;
	}

	/**
	 * Try to send typing indicator to message's channel
	 */
	private async trySendTyping(message: Message): Promise<void> {
		if (
			message.channel &&
			typeof (message.channel as any).sendTyping === "function"
		) {
			try {
				await (message.channel as any).sendTyping();
			} catch (error) {
				console.log("[MessageQueue] Failed to send typing:", error);
			}
		}
	}

	/**
	 * Try to send a message to the channel
	 */
	private async trySendToChannel(
		message: Message,
		options: any,
	): Promise<void> {
		if (
			message.channel &&
			typeof (message.channel as any).send === "function"
		) {
			try {
				await (message.channel as any).send(options);
			} catch (error) {
				console.log("[MessageQueue] Failed to send message:", error);
				throw error;
			}
		}
	}

	/**
	 * Cleanup old message IDs from the deduplication map using a sliding window
	 */
	private cleanupOldMessageIds(now: number): void {
		let cleanupCount = 0;
		for (const [id, timestamp] of this.processedMessageIds.entries()) {
			if (now - timestamp > this.MAX_QUEUE_AGE_MS) {
				this.processedMessageIds.delete(id);
				cleanupCount++;
			}
		}
		if (cleanupCount > 0) {
			console.log(
				`[MessageQueue] Cleaned up ${cleanupCount} expired message IDs from map`,
			);
		}
	}

	/**
	 * Get current queue size (for monitoring/metrics)
	 */
	getQueueSize(): number {
		return this.queue.length;
	}

	/**
	 * Check if queue is currently processing
	 */
	isProcessingQueue(): boolean {
		return this.isProcessing;
	}

	/**
	 * Clear the queue (for testing or emergency situations)
	 */
	clearQueue(): void {
		this.stopTyping();
		this.queue = [];
		this.isProcessing = false;
		console.log("[MessageQueue] Queue cleared");
	}
}
