import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return drizzle(client, { schema });
}

export { schema };
export type { InferSelectModel, InferInsertModel } from "drizzle-orm";
