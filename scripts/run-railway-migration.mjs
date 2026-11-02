import { realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = process.argv[2];

if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(migrationName ?? "")) {
  console.error(
    "Usage: npm run db:migrate -- <migration-file> (for example, 0002_link_authenticated_workers.sql)",
  );
  process.exitCode = 1;
} else {
  const migrationPath = resolve(root, "railway", "migrations", migrationName);
  const migrationsDirectory = await realpath(
    resolve(root, "railway", "migrations"),
  );
  const resolvedMigration = await realpath(migrationPath).catch(() => null);

  if (
    !resolvedMigration ||
    dirname(resolvedMigration) !== migrationsDirectory
  ) {
    console.error(`Migration file not found: ${migrationName}`);
    process.exitCode = 1;
  } else {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      console.error(
        "DATABASE_URL is not set. Add it to .env or the environment.",
      );
      process.exitCode = 1;
    } else {
      const sql = postgres(databaseUrl, {
        max: 1,
        connect_timeout: 15,
        ssl: "require",
      });

      try {
        await sql.file(resolvedMigration);
        console.log(`Applied migration ${migrationName}.`);
      } catch (error) {
        console.error(`Migration ${migrationName} failed.`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        await sql.end();
      }
    }
  }
}
