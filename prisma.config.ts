import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env automatically. Load it here when the file
// exists (local development); on Vercel the variables are already in the
// environment, so we quietly skip it.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — expected in CI and on Vercel.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must use a DIRECT (non-pooled) connection.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
