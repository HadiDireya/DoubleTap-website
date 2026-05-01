import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { Env } from "../env";

export const getDb = (env: Env) => drizzle(env.DB, { schema });
export type DB = ReturnType<typeof getDb>;
