import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` only needs the schema, so it must work with no environment
 * at all — a fresh clone has no `.env`, and the Docker builder never does. A
 * `DATABASE_URL` is only required by the commands that actually reach a server
 * (`migrate`, `db push`, `studio`), and those fail with Prisma's own message if
 * it is genuinely absent. Reading it with a fallback keeps `generate` usable.
 */
const fallbackUrl = "postgresql://kedai:kedai@localhost:5432/kedai?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Neon: this config only accepts a single url, and `prisma migrate` needs an
    // unpooled connection because it takes an advisory lock that Neon's
    // transaction pooler cannot serve. Set DIRECT_URL in .env and run migrations
    // with DATABASE_URL pointed at that unpooled endpoint:
    //   DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
    url: process.env.DATABASE_URL ?? fallbackUrl,
  },
});
