import type { ExtractedTransaction } from "./extract";

// Bypasses Gemini entirely for a handful of very common, tightly-structured
// Indian bank/UPI alert phrasings — the amount/date/merchant sit in a fixed
// spot, so a narrow regex is exact where Gemini would just be paying to
// confirm the obvious. Deliberately starts with a SMALL, conservative set:
// wrong data slipping through untouched (a regex misreading an amount)
// is worse than one avoidable Gemini call, so a template only applies when
// it matches tightly enough to extract every required field with no
// ambiguity — anything that doesn't match falls straight through to
// Gemini, same as today.
//
// This is a starting scaffold, not exhaustive bank coverage: it was built
// from common phrasing patterns, not a corpus of this user's actual raw
// emails (those aren't stored — only a short display snippet is). Extend
// the TEMPLATES list below as new bank formats are recognized; each entry
// is independent and self-contained.

interface Template {
  name: string;
  pattern: RegExp;
  build: (m: RegExpMatchArray) => ExtractedTransaction;
}

function toAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

// Merchant names in these alerts are a short run of words with no period
// in them — excluding "." from the character class (and matching lazily,
// stopping at the first sentence-ending punctuation or trailing phrase)
// is what actually keeps this from bleeding into the rest of the email,
// unlike a greedy match that happily swallows "TOOPS COFFEE. Available
// balance is Rs.12" as if that were all one merchant name.
const MERCHANT = String.raw`([A-Za-z0-9 &'-]{2,40}?)(?=[.,]|\s+(?:on|via|using|If|Available|Avl|Thank|Your|Ref|Info)\b|$)`;

const TEMPLATES: Template[] = [
  // "Rs.350.00 has been debited from your account ... at TOOPS COFFEE."
  {
    name: "generic-debit-account",
    pattern: new RegExp(
      String.raw`Rs\.?\s?([\d,]+\.?\d{0,2})\s+has been debited from (?:your )?(?:a\/c|account)(?:\s+(?:no\.?|number)?\s*[Xx*]*(\d{2,6}))?.{0,80}?(?:at|towards|to)\s+${MERCHANT}`,
      "i",
    ),
    build: (m) => ({
      isTransaction: true,
      bank: null,
      amount: toAmount(m[1]),
      currency: "INR",
      convertedInrAmount: null,
      approxInrRate: null,
      merchant: m[3].trim(),
      date: null,
      transactionTime: null,
      last4: m[2] ?? null,
      transactionType: "debit",
      paymentMethod: "other",
      subcategory: null,
    }),
  },
  // "You have spent Rs.1,234.56 on your Card ending 4521 at SWIGGY."
  {
    name: "generic-card-spend",
    pattern: new RegExp(
      String.raw`(?:you\s?(?:have)?\s?spent|spent)\s+Rs\.?\s?([\d,]+\.?\d{0,2})\s+on\s+your\s+card\s+ending\s+(\d{4}).{0,40}?at\s+${MERCHANT}`,
      "i",
    ),
    build: (m) => ({
      isTransaction: true,
      bank: null,
      amount: toAmount(m[1]),
      currency: "INR",
      convertedInrAmount: null,
      approxInrRate: null,
      merchant: m[3].trim(),
      date: null,
      transactionTime: null,
      last4: m[2],
      transactionType: "debit",
      paymentMethod: "creditCard",
      subcategory: null,
    }),
  },
];

// Returns a confident extraction from a known template, or null (meaning
// "fall through to Gemini") — never a partial/best-effort guess.
export function tryKnownTemplate(text: string): ExtractedTransaction | null {
  for (const t of TEMPLATES) {
    const m = text.match(t.pattern);
    if (!m) continue;
    const result = t.build(m);
    if (!result.amount || result.amount <= 0) continue;
    return result;
  }
  return null;
}
