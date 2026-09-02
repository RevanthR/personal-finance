import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { getCardsOverview } from "@/lib/cards-db";
import { CardsClient } from "@/components/cards/cards-client";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const overview = await getCardsOverview(session.user.id);

  return <CardsClient cards={JSON.parse(JSON.stringify(overview))} />;
}
