import postgres from "postgres";

let client: postgres.Sql | null = null;

/**
 * Lazy singleton so scripts can load dotenv before the first query,
 * and serverless invocations reuse one connection pool.
 */
export function getSql(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = postgres(url, {
      max: 5,
      // Supabase's transaction-mode pooler (port 6543) doesn't support
      // prepared statements; this is safe on direct connections too.
      prepare: false,
      ssl: url.includes("localhost") ? undefined : "require",
    });
  }
  return client;
}
