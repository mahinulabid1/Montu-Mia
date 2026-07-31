import type { Message } from "discord.js";
import type { Tool, ToolResult } from "../types/chat.types";

/**
 * Tool that returns detailed information about the user who sent the message.
 */
export class GetUserDetailsTool implements Tool {
	name = "get_user_details";
	description =
		"Returns detailed information about the user who sent the message.";

	async execute(
		message: Message,
		args?: Record<string, any>,
	): Promise<ToolResult> {
		const now = Date.now();

		// Global User Data
		const id = message.author.id;
		const username = message.author.username;
		const globalName = message.author.globalName ?? "";
		const isBot = message.author.bot;
		const accountCreatedDate = message.author.createdAt.toISOString();
		const accountAgeDays = Math.floor(
			(now - message.author.createdAt.getTime()) / 86_400_000,
		);

		// Server-Specific Member Data
		let serverNickname = "";
		let serverJoinDate = "";
		let serverAgeDays: number | null = null;
		let roles: string[] = [];
		let isServerBooster = false;

		if (message.member) {
			serverNickname = message.member.nickname ?? "";
			serverJoinDate = message.member.joinedAt?.toISOString() ?? "";

			serverAgeDays = message.member.joinedAt
				? Math.floor((now - message.member.joinedAt.getTime()) / 86_400_000)
				: null;

			if (message.member.roles?.cache) {
				roles = message.member.roles.cache
					.filter((role) => role.name !== "@everyone")
					.map((role) => role.name);
			}

			isServerBooster = !!message.member.premiumSince;
		}

		const textRoles = roles.join(", ");
		const serverAgeDaysText =
			serverAgeDays !== null ? serverAgeDays.toString() : "";

		const textContent = `
Global:
id: ${id}
username: ${username}
globalName: ${globalName}
isBot: ${isBot}
accountCreatedDate: ${accountCreatedDate}
accountAgeDays: ${accountAgeDays}

Server:
serverNickname: ${serverNickname}
serverJoinDate: ${serverJoinDate}
serverAgeDays: ${serverAgeDaysText}
isServerBooster: ${isServerBooster}
roles: ${textRoles}
`.trim();

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
			content: textContent,
		};

		return {
			assistantMessage,
			toolMessage,
		};
	}
}

export const getUserDetailsTool = new GetUserDetailsTool();
