import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_fallback_key";

// Extend Express Request type to include user
declare global {
	namespace Express {
		interface Request {
			user?: any;
		}
	}
}

export const authGuard = (req: Request, res: Response, next: NextFunction) => {
	/*
	 * EDGE CASE: Missing Token in Cookie
	 */
	const token = req.cookies?.token;

	if (!token) {
		return res
			.status(401)
			.json({ message: "Unauthorized: Missing or invalid token" });
	}

	try {
		/*
		 * EDGE CASE: Invalid/Expired Token
		 * jwt.verify will throw an error if the token is expired or manipulated.
		 */
		const decoded = jwt.verify(token, JWT_SECRET);
		req.user = decoded;
		next();
	} catch (error) {
		return res
			.status(401)
			.json({ message: "Unauthorized: Token expired or invalid" });
	}
};
