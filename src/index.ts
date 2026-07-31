import "dotenv/config";
import { stopDiscordBot } from "@/discord/discord-service";
import { app, logger } from "@/server";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const HOST = process.env.HOST || "localhost";
const NODE_ENV = process.env.NODE_ENV || "development";

const server = app.listen(PORT, () => {
	logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

const onCloseSignal = () => {
	logger.info("sigint received, shutting down");

	// Close Discord bot first
	stopDiscordBot().finally(() => {
		server.close(() => {
			logger.info("server closed");
			process.exit();
		});
	});

	setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
