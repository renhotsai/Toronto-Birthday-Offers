import { connection } from "next/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Explorer } from "@/components/Explorer";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { getUserVotes, listMapLocations, listOffers } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const t = getDictionary(lang);
  const me = await getCurrentUser();
  const [offers, locations, myVotes] = await Promise.all([
    listOffers(db),
    listMapLocations(db),
    me ? getUserVotes(db, me.id) : Promise.resolve({}),
  ]);

  return (
    <>
      <section className="mb-5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.home.title}</h1>
        <p className="mt-1 max-w-2xl text-muted">{t.home.subtitle}</p>
      </section>
      <Suspense>
        <Explorer lang={lang} offers={offers} locations={locations} myVotes={myVotes} signedIn={!!me} />
      </Suspense>
    </>
  );
}
