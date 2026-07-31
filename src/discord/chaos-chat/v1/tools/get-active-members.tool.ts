import type { Message } from "discord.js";
import type { Tool, ToolResult } from "../types/chat.types";

/**
 * Tool that returns the total member count of the server.
 */
export class GetActiveMembersTool implements Tool {
	name = "get_total_active_member_on_server";
	description = "Returns the total number of members in the server.";

	async execute(
		message: Message,
		args?: Record<string, any>,
	): Promise<ToolResult> {
		const memberCount = message.guild?.memberCount;

		let content = "";
		if (memberCount !== undefined && memberCount !== null) {
			content = `Server total active member is: ${memberCount}`;
		} else {
			content = "<error>This command can only be used in a server.</error>";
		}

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
			content: content,
		};

		return {
			assistantMessage,
			toolMessage,
		};
	}
}

export const getActiveMembersTool = new GetActiveMembersTool();
