import type { Guild, Message } from "discord.js";

export interface GuildUserTrack {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string | null;
	bot: boolean;
	messageCount: number;
	lastActiveAt: string;
}

export interface GuildChannelTrack {
	id: string;
	name: string;
	type: string;
	lastActiveAt: string;
}

export interface GuildTrack {
	id: string;
	name: string;
	iconUrl: string | null;
	memberCount: number;
	totalMessages: number;
	lastActiveAt: string;
	channels: GuildChannelTrack[];
	users: GuildUserTrack[];
}

export interface GuildStoreSummary {
	totalGuildsTracked: number;
	totalUsersTracked: number;
	totalMessagesTracked: number;
	guilds: GuildTrack[];
}

class GuildStore {
	private guildsMap = new Map<
		string,
		{
			id: string;
			name: string;
			iconUrl: string | null;
			memberCount: number;
			totalMessages: number;
			lastActiveAt: string;
			channels: Map<string, GuildChannelTrack>;
			users: Map<string, GuildUserTrack>;
		}
	>();

	/**
	 * Register or sync a Discord Guild object (e.g. on client ready)
	 */
	registerGuild(guild: Guild): void {
		if (!guild || !guild.id) return;
		const existing = this.guildsMap.get(guild.id);
		const name = guild.name || "Unknown Server";
		const iconUrl =
			typeof guild.iconURL === "function" ? guild.iconURL() : null;
		const memberCount = guild.memberCount || 0;
		const nowStr = new Date().toISOString();

		if (existing) {
			existing.name = name;
			existing.iconUrl = iconUrl;
			existing.memberCount = memberCount;
		} else {
			this.guildsMap.set(guild.id, {
				id: guild.id,
				name,
				iconUrl,
				memberCount,
				totalMessages: 0,
				lastActiveAt: nowStr,
				channels: new Map(),
				users: new Map(),
			});
		}
	}

	/**
	 * Record a message event from Discord gateway
	 */
	recordMessage(message: Message): void {
		if (!message || !message.guild) return;

		const guildId = message.guild.id;
		const guildName = message.guild.name || "Unknown Server";
		const iconUrl =
			typeof message.guild.iconURL === "function"
				? message.guild.iconURL()
				: null;
		const memberCount = message.guild.memberCount || 0;
		const nowStr = new Date().toISOString();

		let guildRecord = this.guildsMap.get(guildId);
		if (!guildRecord) {
			guildRecord = {
				id: guildId,
				name: guildName,
				iconUrl,
				memberCount,
				totalMessages: 0,
				lastActiveAt: nowStr,
				channels: new Map(),
				users: new Map(),
			};
			this.guildsMap.set(guildId, guildRecord);
		} else {
			guildRecord.name = guildName;
			if (iconUrl) guildRecord.iconUrl = iconUrl;
			if (memberCount) guildRecord.memberCount = memberCount;
		}

		guildRecord.totalMessages += 1;
		guildRecord.lastActiveAt = nowStr;

		// Record Channel activity
		if (message.channel) {
			const channelId = message.channel.id;
			const channelName =
				"name" in message.channel && typeof message.channel.name === "string"
					? message.channel.name
					: "unknown";
			const channelType =
				"type" in message.channel ? String(message.channel.type) : "GuildText";

			guildRecord.channels.set(channelId, {
				id: channelId,
				name: channelName,
				type: channelType,
				lastActiveAt: nowStr,
			});
		}

		// Record User activity
		if (message.author) {
			const userId = message.author.id;
			const username = message.author.username || "unknown";
			const displayName =
				message.member?.displayName ||
				message.author.displayName ||
				message.author.username ||
				"Unknown User";
			const avatarUrl =
				typeof message.author.displayAvatarURL === "function"
					? message.author.displayAvatarURL()
					: null;
			const bot = message.author.bot || false;

			const existingUser = guildRecord.users.get(userId);
			if (existingUser) {
				existingUser.displayName = displayName;
				existingUser.avatarUrl = avatarUrl;
				existingUser.messageCount += 1;
				existingUser.lastActiveAt = nowStr;
			} else {
				guildRecord.users.set(userId, {
					id: userId,
					username,
					displayName,
					avatarUrl,
					bot,
					messageCount: 1,
					lastActiveAt: nowStr,
				});
			}
		}
	}

	/**
	 * Get summary stats and array of all tracked guilds
	 */
	getSummary(): GuildStoreSummary {
		let totalMessagesTracked = 0;
		const allUsersSet = new Set<string>();
		const guildsList: GuildTrack[] = [];

		for (const g of this.guildsMap.values()) {
			totalMessagesTracked += g.totalMessages;
			for (const uId of g.users.keys()) {
				allUsersSet.add(uId);
			}

			guildsList.push({
				id: g.id,
				name: g.name,
				iconUrl: g.iconUrl,
				memberCount: g.memberCount,
				totalMessages: g.totalMessages,
				lastActiveAt: g.lastActiveAt,
				channels: Array.from(g.channels.values()),
				users: Array.from(g.users.values()).sort(
					(a, b) => b.messageCount - a.messageCount,
				),
			});
		}

		return {
			totalGuildsTracked: this.guildsMap.size,
			totalUsersTracked: allUsersSet.size,
			totalMessagesTracked,
			guilds: guildsList,
		};
	}

	/**
	 * Get specific guild by ID
	 */
	getGuildById(id: string): GuildTrack | null {
		const g = this.guildsMap.get(id);
		if (!g) return null;
		return {
			id: g.id,
			name: g.name,
			iconUrl: g.iconUrl,
			memberCount: g.memberCount,
			totalMessages: g.totalMessages,
			lastActiveAt: g.lastActiveAt,
			channels: Array.from(g.channels.values()),
			users: Array.from(g.users.values()).sort(
				(a, b) => b.messageCount - a.messageCount,
			),
		};
	}

	/**
	 * Reset/Clear in-memory state (useful for tests)
	 */
	clear(): void {
		this.guildsMap.clear();
	}
}

export const guildStore = new GuildStore();
