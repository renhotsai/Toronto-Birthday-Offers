import "dotenv/config";
import { createDb } from "../src/db";
import { importAll } from "../src/lib/osm";

// Prints one line per brand (found / new / matched to manual locations) so coverage gaps are easy to spot.
const db = createDb(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const total = await importAll(db);
console.log(`Done: ${total.found} stores found, ${total.added} new, ${total.updated} matched to manual locations.`);
await db.$client.end();
