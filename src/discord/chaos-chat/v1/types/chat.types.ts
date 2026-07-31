import type { Message } from "discord.js";
import type { ToolCall } from "ollama";

/**
 * Configuration for the chat bot
 */
export interface ChatConfig {
	model: string;
	temperature?: number;
	repeatPenalty?: number;
}

/**
 * Default chat configuration
 */
export const DEFAULT_CHAT_CONFIG: ChatConfig = {
	model: "chad",
	temperature: 1.2,
	repeatPenalty: 1.1,
};

/**
 * Result from understanding a message (whether tool is needed)
 */
export interface UnderstandResponse {
	shouldCall: boolean;
	toolName: string | null;
}

/**
 * A message in the conversation history
 */
export interface ChatMessage {
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	tool_calls?: ToolCall[];
}

/**
 * Structure of a executed tool result formatted for LLM message history
 */
export interface ToolResult {
	assistantMessage: {
		role: "assistant";
		content: string;
		tool_calls: Array<{
			function: {
				name: string;
				arguments: Record<string, any>;
			};
		}>;
	};
	toolMessage: {
		role: "tool";
		content: string;
	};
}

/**
 * Individual tool interface
 */
export interface Tool {
	name: string;
	description: string;
	execute(message: Message, args?: Record<string, any>): Promise<ToolResult>;
}

/**
 * Result of processing a Discord message
 */
export interface MessageProcessingResult {
	reply: string;
	toolResults: ChatMessage[];
}

/**
 * Logger interface for chat events
 */
export interface ChatLogger {
	mentionedBot: () => void;
	replySent: () => void;
	toolCalled: (toolName: string) => void;
	error: (error: Error) => void;
}
