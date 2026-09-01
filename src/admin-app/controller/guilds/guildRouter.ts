import { type Request, type Response, Router } from "express";
import { guildStore } from "@/discord/discord-service/guild-store";
import { authGuard } from "@/middleware/authGuard";

const router = Router();

// Protect all guild routes with authGuard
router.use(authGuard);

/**
 * GET /api/guilds
 * Returns summary statistics and list of tracked Discord servers
 */
router.get("/", (req: Request, res: Response) => {
	try {
		const summary = guildStore.getSummary();
		res.json(summary);
	} catch (error) {
		res.status(500).json({ message: "Error fetching guild statistics" });
	}
});

/**
 * GET /api/guilds/:id
 * Returns specific details for a single tracked guild
 */
router.get("/:id", (req: Request, res: Response) => {
	try {
		const id = req.params.id as string;
		const guild = guildStore.getGuildById(id);
		if (!guild) {
			return res.status(404).json({ message: "Guild not found" });
		}
		res.json(guild);
	} catch (error) {
		res.status(500).json({ message: "Error fetching guild details" });
	}
});

export const guildRouter = router;
