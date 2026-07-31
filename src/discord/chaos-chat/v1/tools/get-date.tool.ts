import type { Message } from "discord.js";
import type { Tool, ToolResult } from "../types/chat.types";

/**
 * Tool that returns the current date.
 * This extracts the hardcoded date logic from chat.ts into a standalone tool.
 */
export class GetDateTool implements Tool {
	name = "get_date";
	description = "Returns the current date and time";

	async execute(
		message: Message,
		args?: Record<string, any> | undefined,
	): Promise<ToolResult> {
		const date = new Date().toString();

		const assistantMessage = {
			role: "assistant" as const,
			content: "",
			tool_calls: [
				{
					function: {
						name: this.name,
						arguments: args ?? {},
					},
				},
			],
		};

		const toolMessage = {
			role: "tool" as const,
			content: `Today's date and time is: ${date}`,
		};

		return {
			assistantMessage,
			toolMessage,
		};
	}
}

/**
 * Singleton instance of GetDateTool for convenience.
 */
export const getDateTool = new GetDateTool();
