import { PrismaClient } from "@prisma/client";
import { makeAdapter } from "@/lib/db-driver";

/**
 * The Prisma database connection.
 *
 * PLAIN ENGLISH: this connects to the database as the OWNER, which means it can
 * see and change everything. It is used for migrations, the demo-data seed, and
 * trusted work on the server that has already checked the user's role with
 * `requireRole()` in `src/lib/auth.ts`.
 *
 * It is deliberately NOT used to fetch data for the cleaner app or the client
 * portal — those go through the Supabase client so the database's own Row Level
 * Security rules apply. See `docs/SECURITY.md`.
 */

const connectionString =
  process.env.DATABASE_URL ??
  (() => {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  })();

// The driver is chosen from the address in DATABASE_URL — see src/lib/db-driver.ts.
const adapter = makeAdapter(connectionString);

// Next.js hot-reloads on every file save in development, which would otherwise
// open a new pool of database connections each time until the database refuses
// any more. Caching the client on `globalThis` keeps it to exactly one.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
