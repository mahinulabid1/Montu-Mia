import type { Guild, Message } from "discord.js";

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
}

export interface GuildStoreSummary {
	totalGuildsTracked: number;
	totalChannelsTracked: number;
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
	}

	/**
	 * Get summary stats and array of all tracked guilds
	 */
	getSummary(): GuildStoreSummary {
		let totalMessagesTracked = 0;
		let totalChannelsTracked = 0;
		const guildsList: GuildTrack[] = [];

		for (const g of this.guildsMap.values()) {
			totalMessagesTracked += g.totalMessages;
			totalChannelsTracked += g.channels.size;

			guildsList.push({
				id: g.id,
				name: g.name,
				iconUrl: g.iconUrl,
				memberCount: g.memberCount,
				totalMessages: g.totalMessages,
				lastActiveAt: g.lastActiveAt,
				channels: Array.from(g.channels.values()),
			});
		}

		return {
			totalGuildsTracked: this.guildsMap.size,
			totalChannelsTracked,
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
