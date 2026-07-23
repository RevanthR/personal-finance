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
  // Axis Bank's own alert template — verified against real emails (both
  // the ₹350 and ₹570 TOOPS COFFE charges from this account): a table-based
  // HTML layout, so \s+ has to absorb long runs of "\r\n" plus variable
  // indentation between every label/value instead of a single space.
  // "Here's the summary of your Axis Bank Credit Card Transaction:
  //  Transaction Amount: INR 350  Merchant Name: TOOPS COFFE
  //  Axis Bank Credit Card No. XX7271  Date & Time: 20-07-2026, 19:03:40 IST"
  {
    name: "axis-bank-transaction-summary",
    pattern: new RegExp(
      String.raw`the summary of your Axis Bank Credit Card Transaction:\s*Transaction Amount:\s*INR\s*([\d,]+\.?\d{0,2})\s*Merchant Name:\s*([A-Za-z0-9 &'.-]{2,40}?)\s*Axis Bank Credit Card No\.?\s*XX(\d{2,6})\s*Date\s*&\s*Time:\s*(\d{2})-(\d{2})-(\d{4}),\s*(\d{2}):(\d{2}):\d{2}`,
      "i",
    ),
    build: (m) => ({
      isTransaction: true,
      bank: "Axis Bank",
      amount: toAmount(m[1]),
      currency: "INR",
      convertedInrAmount: null,
      approxInrRate: null,
      merchant: m[2].trim(),
      date: `${m[6]}-${m[5]}-${m[4]}`,
      transactionTime: `${m[7]}:${m[8]}`,
      last4: m[3],
      transactionType: "debit",
      paymentMethod: "creditCard",
      subcategory: null,
    }),
  },
  // IndusInd Bank's credit-card BILL PAYMENT confirmation — distinct from a
  // card charge (see extract.ts's payment-method guidance, and the CC-bug
  // investigation this template's exact sample email came from). Deliberately
  // NOT paymentMethod "creditCard": this is money paid TOWARD the bill, not
  // spent using the card, and that distinction is what routes it to the
  // "settle" flow (findEntryMatches) instead of misfiring reverseCCEffect.
  // "Thank you for your Payment of INR 33,991.00 towards your IndusInd Bank
  //  Credit Card. Your payment is credited to your Credit Card account on
  //  20/07/2026."
  {
    name: "indusind-bill-payment",
    pattern: new RegExp(
      String.raw`Thank you for your Payment of INR\s*([\d,]+\.?\d{0,2})\s*towards your IndusInd Bank Credit Card\.\s*Your payment is credited to your Credit Card account on (\d{2})\/(\d{2})\/(\d{4})`,
      "i",
    ),
    build: (m) => ({
      isTransaction: true,
      bank: "IndusInd Bank",
      amount: toAmount(m[1]),
      currency: "INR",
      convertedInrAmount: null,
      approxInrRate: null,
      merchant: "IndusInd Bank Credit Card",
      date: `${m[4]}-${m[3]}-${m[2]}`,
      transactionTime: null,
      last4: null,
      transactionType: "credit",
      paymentMethod: "other",
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
