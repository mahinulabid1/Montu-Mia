import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { type Request, type Response, Router } from "express";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_fallback_key";

router.post("/login", async (req: Request, res: Response) => {
	try {
		const { identifier, password } = req.body;

		/*
		 * EDGE CASE: Missing Fields
		 */
		if (!identifier || !password) {
			return res
				.status(400)
				.json({ message: "Identifier and password are required" });
		}

		/*
		 * EDGE CASE: User not found
		 * Identifier can be either username or email.
		 */
		const user = await prisma.user.findFirst({
			where: {
				OR: [{ username: identifier }, { email: identifier }],
			},
		});

		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		/*
		 * EDGE CASE: Password mismatch
		 */
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		/*
		 * Success: Generate Token & Set Cookie
		 */
		const token = jwt.sign(
			{ id: user.id, username: user.username },
			JWT_SECRET,
			{
				expiresIn: "1d",
			},
		);

		res.cookie("token", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 24 * 60 * 60 * 1000, // 1 day
		});

		res.json({
			message: "Login successful",
			user: { id: user.id, username: user.username },
		});
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/logout", (req: Request, res: Response) => {
	res.clearCookie("token");
	res.json({ message: "Logged out successfully" });
});

export const authRouter = router;
