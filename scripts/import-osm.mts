import "dotenv/config";
import { createDb } from "../src/db";
import { importAll } from "../src/lib/osm";

const db = createDb();
const total = await importAll(db);
console.log(`Imported ${total} new locations.`);
await db.$client.end();
