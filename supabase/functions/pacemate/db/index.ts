import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createDatabaseRuntime } from "./runtime.js";

const runtime = createDatabaseRuntime({
  connection: Deno.env.get("PACEMATE_DATABASE_URL"),
  local: Deno.env.get("PACEMATE_LOCAL_DATABASE") === "true",
  connect: postgres,
  makeDatabase: client => drizzle({ client }),
});
// Handlers use explicit query builders; relational schema discovery is unnecessary.
export const db = runtime.database as ReturnType<typeof drizzle>;
export const withDatabaseDeadline = runtime.withDeadline;
export async function checkDatabase() {
  console.info("pacemate database probe starting", runtime.info());
  const rows = await withDatabaseDeadline(client => client.unsafe("SELECT 1 AS ok"));
  if (Number(rows[0]?.ok) !== 1) throw new Error("Unexpected database probe result");
  console.info("pacemate database probe passed");
  return { status: "ok", ...runtime.info() };
}
