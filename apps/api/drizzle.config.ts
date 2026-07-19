import { defineConfig } from "drizzle-kit";

// En dev, DATABASE_URL vive en el .env de la raíz; en CI/deploy llega
// como variable de entorno y el archivo no existe (por eso el try).
try {
  process.loadEnvFile("../../.env");
} catch {
  // sin .env: se usa el process.env tal cual
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    schema: "public",
  },
});
