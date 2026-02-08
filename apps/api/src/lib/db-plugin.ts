import fp from "fastify-plugin";
import { createDatabase } from "@commerce-os/db";
import type { Database } from "@commerce-os/db";
import { getEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export const dbPlugin = fp(async (app) => {
  const env = getEnv();
  const db = createDatabase(env.DATABASE_URL);

  app.decorate("db", db);

  app.log.info("Database connection established");
});
