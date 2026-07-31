import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { Pool } from "pg";
import { authGuard } from "@/middleware/authGuard";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Protect all API key routes
router.use(authGuard);

router.get("/", async (req: Request, res: Response) => {
	try {
		/*
		 * EDGE CASE: Empty database
		 * Prisma returns [] which is perfectly fine.
		 */
		const apiKeys = await prisma.apiKey.findMany({
			orderBy: { createdAt: "desc" },
		});
		res.json(apiKeys);
	} catch (error) {
		res.status(500).json({ message: "Error fetching API keys" });
	}
});

router.post("/", async (req: Request, res: Response) => {
	try {
		const { subjectName, category, apiKey } = req.body;

		/*
		 * EDGE CASE: Missing required fields
		 */
		if (!subjectName || !category || !apiKey) {
			return res.status(400).json({ message: "Missing required fields" });
		}

		/*
		 * EDGE CASE: Invalid category constraint validation
		 */
		if (category !== "Ollama API" && category !== "other") {
			return res
				.status(400)
				.json({ message: "Category must be 'Ollama API' or 'other'" });
		}

		const newKey = await prisma.apiKey.create({
			data: { subjectName, category, apiKey },
		});

		res.status(201).json(newKey);
	} catch (error) {
		res.status(500).json({ message: "Error creating API key" });
	}
});

router.put("/:id", async (req: Request, res: Response) => {
	try {
		const id = req.params.id as string;
		const { subjectName, category } = req.body;

		/*
		 * EDGE CASE: Editing actual API Key is blocked by not passing it to update data
		 * EDGE CASE: Invalid category
		 */
		if (category && category !== "Ollama API" && category !== "other") {
			return res
				.status(400)
				.json({ message: "Category must be 'Ollama API' or 'other'" });
		}

		const updatedKey = await prisma.apiKey.update({
			where: { id },
			data: { subjectName, category },
		});

		res.json(updatedKey);
	} catch (error: any) {
		/*
		 * EDGE CASE: Record doesn't exist (Prisma throws P2025)
		 */
		if (error.code === "P2025") {
			return res.status(404).json({ message: "API Key not found" });
		}
		res.status(500).json({ message: "Error updating API key" });
	}
});

router.delete("/:id", async (req: Request, res: Response) => {
	try {
		const id = req.params.id as string;
		await prisma.apiKey.delete({ where: { id } });
		res.json({ message: "Deleted successfully" });
	} catch (error: any) {
		/*
		 * EDGE CASE: Record doesn't exist
		 */
		if (error.code === "P2025") {
			return res.status(404).json({ message: "API Key not found" });
		}
		res.status(500).json({ message: "Error deleting API key" });
	}
});

export const apiKeyRouter = router;
