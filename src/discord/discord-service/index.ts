import { Client, GatewayIntentBits } from "discord.js";
import { pino } from "pino";
import { ChaosChatV1 } from "@/discord/chaos-chat/v1";

const logger = pino({ name: "discord-service" });

let discordClient: Client | null = null;

// No slash commands needed for ChaosChat v1

export const startDiscordBot = async () => {
	discordClient = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers,
		],
	});

	try {
		await discordClient.login(process.env.DISCORD_BOT_TOKEN);
		logger.info("✅ Discord client logged in");

		// Register slash commands if needed
		if (discordClient.application) {
			await discordClient.application.commands.set([]);
			logger.info("✅ Slash commands cleared");
		}

		// Initialize only V1
		const chaosChat = new ChaosChatV1(discordClient);
		logger.info("✅ ChaosChatV1 initialized");

		// Register Chaos Chat gateway listeners
		discordClient.on("messageCreate", async (message) => {
			try {
				await chaosChat.handleMessage(message);
			} catch (err) {
				logger.error({ err }, "Error handling messageCreate event");
			}
		});

		discordClient.on("guildMemberAdd", async (member) => {
			try {
				await chaosChat.handleWelcome(member);
			} catch (err) {
				logger.error({ err }, "Error handling guildMemberAdd event");
			}
		});

		logger.info("✅ Discord bot services initialized");
	} catch (error) {
		logger.error(`❌ Discord login failed: ${JSON.stringify(error)}`);
		throw error;
	}
};

export const stopDiscordBot = async () => {
	if (discordClient) {
		await discordClient.destroy();
		logger.info("🔴 Discord client destroyed");
		discordClient = null;
	}
};

export { discordClient };
