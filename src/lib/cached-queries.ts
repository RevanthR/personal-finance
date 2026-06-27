import { unstable_cache } from "next/cache";
import { db } from "./db";

// Active templates are fetched on every dashboard + months load but change rarely.
// Cache for 30 seconds; tag allows instant invalidation after mutations.
export const getActiveTemplates = unstable_cache(
  async (userId: string) =>
    db.lineItemTemplate.findMany({
      where: { userId, isActive: true, foreClosedOn: null },
      include: { chitFund: true },
    }),
  ["active-templates"],
  { revalidate: 30, tags: ["active-templates"] }
);

export const templateCacheTag = "active-templates";
