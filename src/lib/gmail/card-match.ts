import { tokenOverlapScore } from "./text-similarity";

export type MatchableCard = {
  templateId: string;
  name: string;
  bank: string | null;
  network: string | null;
  last4: string | null;
};

// Jaccard-style overlap between the extracted bank name and a card's
// name+bank text — good enough to tell "Axis Bank" apart from "HDFC Bank"
// without a fuzzy-matching dependency.
function similarity(a: string, b: string): number {
  return tokenOverlapScore(a, b, { mode: "jaccard" });
}

const SIMILARITY_THRESHOLD = 0.3;

// Picks the most likely CreditCard template for a Gmail-extracted
// transaction. `CreditCard.bank`/`network` are optional fields most users
// leave blank, so name+bank similarity (against the card's actual display
// name, which the user does fill in) is the primary signal, not the bank
// field alone.
export function matchCard(
  extracted: { bank: string | null; last4: string | null },
  cards: MatchableCard[],
): string | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) return cards[0].templateId;

  if (extracted.last4) {
    const exact = cards.find(c => c.last4 && c.last4 === extracted.last4);
    if (exact) return exact.templateId;
  }

  if (extracted.bank) {
    let best: { templateId: string; score: number } | null = null;
    for (const c of cards) {
      const text = `${c.name} ${c.bank ?? ""} ${c.network ?? ""}`;
      const score = similarity(extracted.bank, text);
      if (!best || score > best.score) best = { templateId: c.templateId, score };
    }
    if (best && best.score >= SIMILARITY_THRESHOLD) return best.templateId;
  }

  return null;
}
