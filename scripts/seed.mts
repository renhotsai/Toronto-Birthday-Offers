import "dotenv/config";
import { createDb } from "../src/db";
import { seedOffers } from "../src/lib/seed";
import { SEED_OFFERS } from "../data/seed-offers";

const db = createDb(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const added = await seedOffers(db, SEED_OFFERS);
console.log(`Seeded ${added} new offers (${SEED_OFFERS.length} in seed file).`);
await db.$client.end();
