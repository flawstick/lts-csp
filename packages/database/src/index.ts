import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, or, desc, asc, sql } from "drizzle-orm";

import * as schema from "./schema";

export * from "./schema";
export * from "./queries";
export { schema };
export { eq, and, or, desc, asc, sql };

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export type Database = typeof db;
