#!/usr/bin/env node
/**
 * Runs a .sql file against the database.
 *
 * PLAIN ENGLISH: this lets you apply the security rules, or run the security
 * test, using only Node — you do not need the `psql` command installed.
 *
 *   node scripts/db-sql.mjs prisma/sql/01_rls.sql
 *   node scripts/db-sql.mjs scripts/test-rls.sql --report
 */
import { readFileSync } from "node:fs";
import pg from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  /* variables already in the environment */
}

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/db-sql.mjs <file.sql> [--report]");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL (or DIRECT_URL) is not set. Copy .env.example to .env first.");
  process.exit(1);
}

/**
 * Neon is reached over a web connection rather than a plain database port.
 * Everything else uses the ordinary driver. See src/lib/db-driver.ts.
 */
async function connect(url) {
  if (!/@[^/]*\.neon\.tech/.test(url)) {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    return { query: (sql) => c.query(sql), end: () => c.end() };
  }

  const { Client, neonConfig } = await import("@neondatabase/serverless");
  neonConfig.webSocketConstructor ??= (await import("ws")).default;
  const c = new Client(url);
  await c.connect();
  return { query: (sql) => c.query(sql), end: () => c.end() };
}

const client = await connect(connectionString);

// CleanOS lives in its own schema so the other apps sharing this database can
// have theirs. Taken from ?schema= on the connection string, as Prisma reads it.
const schema = new URL(connectionString).searchParams.get("schema");
if (schema) {
  await client.query(`SET search_path = "${schema.replace(/"/g, '""')}", pg_temp, public`);
}

try {
  await client.query(readFileSync(file, "utf8"));

  if (flags.includes("--report")) {
    const { rows } = await client.query(
      `SELECT ok, check_name, expected, actual FROM results ORDER BY ok, check_name`,
    );
    const pad = Math.max(...rows.map((r) => r.check_name.length));
    for (const r of rows) {
      console.log(
        `${r.ok ? "  PASS  " : "**FAIL**"}  ${r.check_name.padEnd(pad)}  expected: ${String(r.expected).padEnd(10)} got: ${r.actual}`,
      );
    }
    const failed = rows.filter((r) => !r.ok).length;
    console.log(`\n${rows.length - failed} passed, ${failed} failed, ${rows.length} total`);
    if (failed > 0) {
      console.error("\nSECURITY TEST FAILED — someone can see data they should not.");
      process.exitCode = 1;
    }
  } else {
    console.log(`Applied ${file}`);
  }
} finally {
  await client.end();
}
