import { defineConfig } from 'drizzle-kit';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Drizzle's documented D1 HTTP driver; keep remote credentials separate from
// the local config so generate/build never require production secrets.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    databaseId: required('D1_DATABASE_ID'),
    token: required('CLOUDFLARE_API_TOKEN'),
  },
});
