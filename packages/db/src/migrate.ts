import { migrateDb } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url || url.startsWith("pglite://")) {
  console.log("PGlite databases migrate automatically on connect.");
} else {
  await migrateDb(url);
  console.log("Migrations applied.");
}
