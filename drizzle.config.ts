import { defineConfig } from "drizzle-kit";

const connectionString = process.env.POSTGRES_URL || 'postgresql://idlr_user:idlr_password@localhost:5432/idlr_pts';
if (!connectionString) {
  throw new Error("POSTGRES_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
