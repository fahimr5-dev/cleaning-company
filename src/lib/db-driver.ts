import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Which driver to talk to the database with.
 *
 * PLAIN ENGLISH: a Neon database is reached over a web connection rather than a
 * plain database port. That is what lets it work from Vercel without running
 * out of connections, and it is the only way to reach Neon from a network that
 * allows web traffic and nothing else.
 *
 * Any other Postgres — Supabase, a database on your own server, one on your
 * laptop — uses the ordinary driver. You never choose: this reads the address
 * in DATABASE_URL and picks the right one.
 */

export function isNeon(connectionString: string): boolean {
  return /@[^/]*\.neon\.tech/.test(connectionString);
}

/**
 * Splits `?schema=cleanos` off the connection string.
 *
 * PLAIN ENGLISH: CleanOS keeps its tables in a folder called `cleanos` so the
 * other apps sharing the database can have their own. The driver has to be
 * told which folder separately — leaving `schema=` on the address itself makes
 * Neon reject the connection outright.
 */
export function splitSchema(connectionString: string): { url: string; schema: string } {
  try {
    const parsed = new URL(connectionString);
    const schema = parsed.searchParams.get("schema") ?? "public";
    parsed.searchParams.delete("schema");
    return { url: parsed.toString(), schema };
  } catch {
    // Not a URL we can parse — hand it back untouched rather than guessing.
    return { url: connectionString, schema: "public" };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeAdapter(raw: string): any {
  const { url: connectionString, schema } = splitSchema(raw);

  if (!isNeon(connectionString)) return new PrismaPg({ connectionString }, { schema });

  // Loaded only when a Neon address is actually in use, so a project on
  // Supabase never pulls in the Neon driver at all. `require` rather than
  // `import()` because the callers are top-level and cannot be asynchronous.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PrismaNeon } = require("@prisma/adapter-neon") as typeof import("@prisma/adapter-neon");
  const { neonConfig } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // Neon's driver needs a WebSocket, which Node does not always provide.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor ??= require("ws");

  return new PrismaNeon({ connectionString }, { schema });
}
