import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
	prisma: PrismaClient | undefined;
	pool: Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;

export const pool = globalForDb.pool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

const adapter = new PrismaPg(pool);

export const prisma = globalForDb.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForDb.prisma = prisma;
