/**
 * The website-import fixture sites (test/fixtures/sites) on a local port, for the e2e stack (apps/web/e2e/run-all.sh):
 *   SITE_FIXTURE_PORT=4190 tsx scripts/site-fixtures-server.ts
 * The API reaches them through SITE_IMPORT_TEST_HOSTS (never in production), e.g. "studio-verde.test=127.0.0.1,...".
 */
import { SITES, startFixtureServer } from "../test/site-fixtures.js";

const port = Number(process.env.SITE_FIXTURE_PORT ?? 4190);
const s = await startFixtureServer(port);
console.log(`site fixtures on http://127.0.0.1:${s.port}: ${Object.keys(SITES).join(", ")}`);
console.log(`SITE_IMPORT_TEST_HOSTS=${Object.keys(SITES).map((h) => `${h}=127.0.0.1`).join(",")}`);
