import { db } from "@/lib/db";
import { MODEL } from "@/lib/gmail/extract";

// Approximate published per-1M-token USD pricing, keyed by model name so a
// future model swap (this app calls the "gemini-flash-latest" alias, not a
// pinned dated version) just needs a new entry here, not a rewrite.
// Verified against ai.google.dev/gemini-api/docs/pricing as of July 2026 for
// Gemini 2.5 Flash — re-check if Google repoints the alias to a new model
// (2.5 Flash itself is slated for deprecation October 16, 2026).
const PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  [MODEL]: { input: 0.30, output: 2.50 },
};

// thoughtsTokens (Gemini 2.5's internal reasoning tokens, see GeminiCallUsage
// in extract.ts) are billed at the same per-token rate as candidatesTokens —
// Google's pricing docs bill them both simply as "output tokens", they're
// just reported as two separate usageMetadata fields. Omitting thoughtsTokens
// here was undercounting real cost, not just under-reporting it.
export function estimateCostUsd(model: string, promptTokens: number, candidatesTokens: number, thoughtsTokens = 0): number {
  const pricing = PRICING_USD_PER_MILLION[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + ((candidatesTokens + thoughtsTokens) / 1_000_000) * pricing.output;
}

export interface GeminiUsage {
  promptTokens: number;
  candidatesTokens: number;
  thoughtsTokens: number;
}

// Records one real Gemini API call (batchSize > 1 for a batched call
// covering several emails in one request). Never allowed to break the sync
// it's measuring — a logging failure is swallowed, not thrown.
export async function logGeminiCall(
  userId: string,
  params: { model: string; batchSize: number } & GeminiUsage,
): Promise<void> {
  try {
    await db.geminiUsageLog.create({
      data: {
        userId,
        model: params.model,
        batchSize: params.batchSize,
        promptTokens: params.promptTokens,
        candidatesTokens: params.candidatesTokens,
        thoughtsTokens: params.thoughtsTokens,
      },
    });
  } catch {
    // Telemetry failure must never take down the sync itself.
  }
}
