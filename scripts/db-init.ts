/** Applies db/schema.sql. Run: npm run db:init */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync } from "node:fs";
import { getSql } from "../src/lib/db";

async function main() {
  const schema = readFileSync("db/schema.sql", "utf8");
  const sql = getSql();
  await sql.unsafe(schema);
  console.log("Schema applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
