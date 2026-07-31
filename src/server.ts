import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import morgan from "morgan";
import path from "path";
import { pino } from "pino";
import { apiKeyRouter } from "@/admin-app/controller/apikeys/apiKeyRouter";
import { authRouter } from "@/admin-app/controller/auth/authRouter";
import { promptRouter } from "@/admin-app/controller/prompts/promptRouter";
import { userRouter } from "@/admin-app/controller/user/userRouter";
import { startDiscordBot } from "@/discord/discord-service";
import { apiKeyManager } from "@/llm-apis/ollama-cloud-api/ollama-api-key.manager";
import { uiAuthGuard } from "@/middleware/uiAuthGuard";

const logger = pino({ name: "server start" });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Routes

app.use("/api/auth", authRouter);
app.use("/api/apikeys", apiKeyRouter);
app.use("/api/prompts", promptRouter);
app.use("/users", userRouter);

// App Interface UI
const uiPath = path.join(process.cwd(), "src", "admin-app", "view");
app.use(express.static(uiPath));

app.get("/login", (req, res) => {
	res.sendFile(path.join(uiPath, "index.html"));
});

app.get("/dashboard", uiAuthGuard, (req, res) => {
	res.sendFile(path.join(uiPath, "dashboard.html"));
});

// Initialize API Key Manager
apiKeyManager.init().catch((error) => {
	logger.error(
		`API Key Manager failed to initialize: ${JSON.stringify(error)}`,
	);
});

// Start Discord bot after Express setup
startDiscordBot().catch((error) => {
	logger.error(`Discord bot failed to start: ${JSON.stringify(error)}`);
});

// Error handlers
app.use(((err, req, res, next) => {
	logger.error(err);
	res.status(500).send("Internal Server Error");
}) as express.ErrorRequestHandler);

export { app, logger };
