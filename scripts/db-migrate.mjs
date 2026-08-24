#!/usr/bin/env node
/**
 * Applies pending migrations without the Prisma command-line tool.
 *
 * PLAIN ENGLISH: `npx prisma migrate deploy` opens a plain database port.
 * Some networks — a locked-down company network, this project's build sandbox —
 * only allow ordinary web traffic, and a Neon database is reachable that way.
 * This applies exactly the same migration files, in the same order, and records
 * them in the same table Prisma uses, so `prisma migrate deploy` afterwards
 * correctly reports that there is nothing left to do.
 *
 *   node scripts/db-migrate.mjs
 *
 * Prefer `npx prisma migrate deploy` whenever your network allows it.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

try { process.loadEnvFile(".env"); } catch { /* already in the environment */ }

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or DIRECT_URL) is not set. Copy .env.example to .env first.");
  process.exit(1);
}

async function connect(connectionString) {
  if (!/@[^/]*\.neon\.tech/.test(connectionString)) {
    const c = new pg.Client({ connectionString });
    await c.connect();
    return c;
  }
  const { Client, neonConfig } = await import("@neondatabase/serverless");
  neonConfig.webSocketConstructor ??= (await import("ws")).default;
  const c = new Client(connectionString);
  await c.connect();
  return c;
}

const client = await connect(url);

// The schema CleanOS lives in, taken from ?schema= on the connection string
// exactly as Prisma reads it. Without this the tables would land in `public`
// and collide with the other apps sharing this database.
const schema = new URL(url).searchParams.get("schema") ?? "public";

try {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema.replace(/"/g, '""')}"`);
  await client.query(`SET search_path = "${schema.replace(/"/g, '""')}", public`);

  // The same table Prisma keeps its own record in, created the same way.
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id                      VARCHAR(36) PRIMARY KEY NOT NULL,
      checksum                VARCHAR(64) NOT NULL,
      finished_at             TIMESTAMPTZ,
      migration_name          VARCHAR(255) NOT NULL,
      logs                    TEXT,
      rolled_back_at          TIMESTAMPTZ,
      started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count     INTEGER NOT NULL DEFAULT 0
    )`);

  const { rows: done } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  const applied = new Set(done.map((r) => r.migration_name));

  const dir = "prisma/migrations";
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "migration.sql")))
    .map((e) => e.name)
    .sort();

  let count = 0;
  for (const name of names) {
    if (applied.has(name)) continue;

    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const startedAt = new Date();

    console.log(`Applying ${name} into schema "${schema}"…`);
    await client.query(sql);

    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, $4, 1)`,
      [randomUUID(), checksum, name, startedAt],
    );
    count += 1;
  }

  console.log(
    count === 0
      ? `No pending migrations — all ${names.length} are already applied.`
      : `Applied ${count} migration(s).`,
  );
} finally {
  await client.end();
}
