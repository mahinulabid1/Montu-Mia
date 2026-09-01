import type { Guild, Message } from "discord.js";
import { beforeEach, describe, expect, it } from "vitest";
import { guildStore } from "../guild-store";

describe("GuildStore In-Memory Service", () => {
	beforeEach(() => {
		guildStore.clear();
	});

	it("should initialize empty summary statistics", () => {
		const summary = guildStore.getSummary();
		expect(summary.totalGuildsTracked).toBe(0);
		expect(summary.totalUsersTracked).toBe(0);
		expect(summary.totalMessagesTracked).toBe(0);
		expect(summary.guilds).toEqual([]);
	});

	it("should register a connected guild via registerGuild", () => {
		const mockGuild = {
			id: "guild_123",
			name: "Test Lounge",
			iconURL: () => "https://cdn.discordapp.com/icons/g123.png",
			memberCount: 42,
		} as unknown as Guild;

		guildStore.registerGuild(mockGuild);
		const summary = guildStore.getSummary();

		expect(summary.totalGuildsTracked).toBe(1);
		expect(summary.guilds[0].id).toBe("guild_123");
		expect(summary.guilds[0].name).toBe("Test Lounge");
		expect(summary.guilds[0].memberCount).toBe(42);
		expect(summary.guilds[0].totalMessages).toBe(0);
	});

	it("should record messages and track user/channel statistics", () => {
		const mockMessage = {
			guild: {
				id: "guild_456",
				name: "Dev Server",
				iconURL: () => null,
				memberCount: 10,
			},
			channel: {
				id: "channel_789",
				name: "general",
				type: 0,
			},
			author: {
				id: "user_001",
				username: "alice",
				displayName: "Alice",
				displayAvatarURL: () => "https://cdn.discordapp.com/avatars/alice.png",
				bot: false,
			},
			member: {
				displayName: "Alice Smith",
			},
		} as unknown as Message;

		guildStore.recordMessage(mockMessage);

		const summary = guildStore.getSummary();
		expect(summary.totalGuildsTracked).toBe(1);
		expect(summary.totalUsersTracked).toBe(1);
		expect(summary.totalMessagesTracked).toBe(1);

		const guild = summary.guilds[0];
		expect(guild.id).toBe("guild_456");
		expect(guild.totalMessages).toBe(1);
		expect(guild.channels.length).toBe(1);
		expect(guild.channels[0].name).toBe("general");

		expect(guild.users.length).toBe(1);
		expect(guild.users[0].id).toBe("user_001");
		expect(guild.users[0].displayName).toBe("Alice Smith");
		expect(guild.users[0].messageCount).toBe(1);
	});

	it("should increment message counts for repeated messages", () => {
		const mockMessage = {
			guild: {
				id: "guild_456",
				name: "Dev Server",
				iconURL: () => null,
				memberCount: 10,
			},
			channel: {
				id: "channel_789",
				name: "general",
				type: 0,
			},
			author: {
				id: "user_001",
				username: "alice",
				displayName: "Alice",
				displayAvatarURL: () => null,
				bot: false,
			},
		} as unknown as Message;

		guildStore.recordMessage(mockMessage);
		guildStore.recordMessage(mockMessage);

		const guild = guildStore.getGuildById("guild_456");
		expect(guild).not.toBeNull();
		expect(guild?.totalMessages).toBe(2);
		expect(guild?.users[0].messageCount).toBe(2);
	});
});
