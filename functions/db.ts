import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../src/db/schema';

export type Database = DrizzleD1Database<typeof schema>;

export function getDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}
