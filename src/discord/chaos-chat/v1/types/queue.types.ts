import type { Message } from "discord.js";

/**
 * Item in the message processing queue
 * We store the message and use message.channel for sending replies
 */
export interface QueueMessage {
	message: Message;
	enqueuedAt: number;
}

/**
 * Interface for ChaosChatV1 methods needed by the queue service
 * Used to avoid circular dependency
 */
export interface IChaosChatProcessor {
	understand(
		message: Message,
	): Promise<{ shouldCall: boolean; toolName: string | null }>;
	generateReply(message: Message): Promise<string | null>;
	sanitizeReply(message: string): string;
	sanitizeMessage(message: string): string;
	getToolRegistry(): any; // Returns ToolRegistry
	cLog: {
		mentionedBot: () => void;
		replySent: () => void;
		toolCalled?: (toolName: string) => void;
	};
}

/**
 * Sendable channel type - any channel that can send messages
 */
export type SendableChannel = any;
