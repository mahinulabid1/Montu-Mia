import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { guildStore } from "@/discord/discord-service/guild-store";
import { app } from "@/server";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_fallback_key";

describe("Guilds REST API Endpoints", () => {
	beforeEach(() => {
		guildStore.clear();
	});

	describe("GET /api/guilds", () => {
		it("should return 401 Unauthorized if no token cookie is provided", async () => {
			const res = await request(app).get("/api/guilds");
			expect(res.status).toBe(401);
			expect(res.body.message).toContain("Unauthorized");
		});

		it("should return 200 OK with summary statistics when authenticated", async () => {
			const validToken = jwt.sign({ username: "admin" }, JWT_SECRET);

			const res = await request(app)
				.get("/api/guilds")
				.set("Cookie", [`token=${validToken}`]);

			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty("totalGuildsTracked");
			expect(res.body).toHaveProperty("totalUsersTracked");
			expect(res.body).toHaveProperty("totalMessagesTracked");
			expect(Array.isArray(res.body.guilds)).toBe(true);
		});
	});

	describe("GET /api/guilds/:id", () => {
		it("should return 404 for non-existent guild ID when authenticated", async () => {
			const validToken = jwt.sign({ username: "admin" }, JWT_SECRET);

			const res = await request(app)
				.get("/api/guilds/non_existent_id")
				.set("Cookie", [`token=${validToken}`]);

			expect(res.status).toBe(404);
			expect(res.body.message).toBe("Guild not found");
		});
	});
});
