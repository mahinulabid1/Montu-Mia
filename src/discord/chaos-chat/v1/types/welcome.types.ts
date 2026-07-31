import type {
	GuildMember,
	NewsChannel,
	PrivateThreadChannel,
	PublicThreadChannel,
	TextChannel,
} from "discord.js";

/**
 * Configuration for the WelcomeService
 */
export interface WelcomeServiceConfig {
	/** The channel ID where welcome messages should be sent */
	targetChannelId: string;
	/** Whether to use LLM to generate welcome messages (future enhancement) */
	useLLM?: boolean;
	/** Custom welcome message template (optional) */
	customTemplate?: string;
}

/**
 * Interface for the WelcomeService
 */
export interface IWelcomeService {
	handleNewMember(member: GuildMember): Promise<void>;
}

/**
 * Union type for channels that can send text messages
 * Includes TextChannel, NewsChannel, and ThreadChannels
 */
export type TextBasedChannel =
	| TextChannel
	| NewsChannel
	| PublicThreadChannel
	| PrivateThreadChannel;

/**
 * Result of channel validation
 */
export interface ChannelValidationResult {
	channel: TextBasedChannel | null;
	error?: {
		type:
			| "NOT_FOUND"
			| "NOT_TEXT_BASED"
			| "GUILD_MISMATCH"
			| "ARCHIVED"
			| "PERMISSIONS";
		message: string;
	};
}

/**
 * DTO for welcome message generation
 */
export interface WelcomeMessageContext {
	member: GuildMember;
	guildId: string;
	guildName: string;
}
