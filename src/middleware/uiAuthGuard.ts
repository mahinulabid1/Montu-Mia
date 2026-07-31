import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_fallback_key";

export const uiAuthGuard = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const token = req.cookies?.token;

	if (!token) {
		return res.redirect("/login");
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		req.user = decoded;
		next();
	} catch (error) {
		// If the token is invalid/expired, clear it and redirect
		res.clearCookie("token");
		return res.redirect("/login");
	}
};
