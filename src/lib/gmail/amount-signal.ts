// Free pre-filter run before any Gemini call: does this email even mention
// a monetary amount at all? A missed real transaction (false negative) is
// far worse than one wasted Gemini call (false positive), so this stays
// deliberately high-recall — it only rules out email with NO currency
// signal whatsoever (newsletters, calendar reminders, social
// notifications that happened to match the Gmail search's loose keywords
// like "alert" or "payment").
//
// Covers every currency this app already handles (see CURRENCY_SYMBOLS in
// src/components/imports/imports-client.tsx) plus the bare ₹/Rs/INR
// forms — a currency symbol or ISO code adjacent to a number, in either
// order ("₹1,234.56", "Rs 1234", "INR 1,234", "45.00 USD").
const CURRENCY_SYMBOL = String.raw`(?:₹|\$|€|£)`;
const CURRENCY_WORD = String.raw`(?:Rs\.?|INR|USD|EUR|GBP|AUD|CAD|SGD|AED)`;
const NUMBER = String.raw`\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?`;

const AMOUNT_SIGNAL = new RegExp(
  `${CURRENCY_SYMBOL}\\s?${NUMBER}` +
  `|\\b${CURRENCY_WORD}\\s?${NUMBER}` +
  `|${NUMBER}\\s?\\b${CURRENCY_WORD}\\b`,
  "i",
);

export function hasAmountSignal(text: string): boolean {
  return AMOUNT_SIGNAL.test(text);
}
