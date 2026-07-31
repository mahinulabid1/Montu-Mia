import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { Pool } from "pg";
import { authGuard } from "@/middleware/authGuard";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

router.use(authGuard);

router.get("/", async (req: Request, res: Response) => {
	try {
		const prompts = await prisma.prompt.findMany({
			orderBy: { createdAt: "desc" },
		});
		res.json(prompts);
	} catch (error) {
		res.status(500).json({ message: "Error fetching prompts" });
	}
});

router.post("/", async (req: Request, res: Response) => {
	try {
		const { promptName, promptValue, category } = req.body;

		/*
		 * EDGE CASE: Missing required fields
		 */
		if (!promptName || !promptValue) {
			return res.status(400).json({ message: "Missing required fields" });
		}

		const newPrompt = await prisma.prompt.create({
			data: { promptName, promptValue, category },
		});

		res.status(201).json(newPrompt);
	} catch (error: any) {
		/*
		 * EDGE CASE: Unique constraint violation (duplicate promptName)
		 * Prisma throws P2002 for unique constraint failures.
		 */
		if (error.code === "P2002") {
			return res
				.status(400)
				.json({ message: "A prompt with this name already exists" });
		}
		res.status(500).json({ message: "Error creating prompt" });
	}
});

router.put("/:id", async (req: Request, res: Response) => {
	try {
		const id = req.params.id as string;
		const { promptName, promptValue, category } = req.body;

		const updatedPrompt = await prisma.prompt.update({
			where: { id },
			data: { promptName, promptValue, category },
		});

		res.json(updatedPrompt);
	} catch (error: any) {
		/*
		 * EDGE CASE: Target doesn't exist
		 */
		if (error.code === "P2025") {
			return res.status(404).json({ message: "Prompt not found" });
		}
		/*
		 * EDGE CASE: Updating to an existing promptName
		 */
		if (error.code === "P2002") {
			return res
				.status(400)
				.json({ message: "A prompt with this name already exists" });
		}
		res.status(500).json({ message: "Error updating prompt" });
	}
});

router.delete("/:id", async (req: Request, res: Response) => {
	try {
		const id = req.params.id as string;
		await prisma.prompt.delete({ where: { id } });
		res.json({ message: "Deleted successfully" });
	} catch (error: any) {
		/*
		 * EDGE CASE: Record doesn't exist
		 */
		if (error.code === "P2025") {
			return res.status(404).json({ message: "Prompt not found" });
		}
		res.status(500).json({ message: "Error deleting prompt" });
	}
});

export const promptRouter = router;
