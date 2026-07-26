import { matchKnownMerchant, normalizeMerchantName } from "@/lib/merchant/normalizer";
import { registerMerchant } from "@/lib/merchant/registry";

export interface MerchantExtraction {
  name: string;
  confidence: number;
  categoryHint?: string;
}

export interface MerchantIdentification {
  merchantId: string;
  merchantName: string;
  merchantConfidence: number;
}

const KNOWN_MATCH_CONFIDENCE = 0.9;
const PATTERN_MATCH_CONFIDENCE = 0.6;

// "Coffee at Starbucks" -> captures "Starbucks"
const AT_PATTERN = /\bat\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2})/;
// "Amazon order", "Uber ride" -> captures the leading capitalized phrase
const ACTION_SUFFIX_PATTERN =
  /\b([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2})\s+(?:order|ride|trip|delivery|purchase|payment|subscription)\b/;

/**
 * Deterministic, rule-based merchant extraction — no LLM, no embeddings.
 * Tries known merchant aliases first (highest confidence), then falls back
 * to a couple of structural note patterns. Returns undefined when nothing
 * can be identified, per spec: merchant fields stay unset rather than
 * guessing.
 */
export function extractMerchant(note: string): MerchantExtraction | undefined {
  const trimmed = note.trim();
  if (!trimmed) return undefined;

  const known = matchKnownMerchant(trimmed);
  if (known) {
    return {
      name: known.canonicalName,
      confidence: KNOWN_MATCH_CONFIDENCE,
      categoryHint: known.categoryHint,
    };
  }

  const candidate =
    AT_PATTERN.exec(trimmed)?.[1] ?? ACTION_SUFFIX_PATTERN.exec(trimmed)?.[1];
  if (!candidate) return undefined;

  const normalized = normalizeMerchantName(candidate);
  return {
    name: normalized.canonicalName,
    confidence: PATTERN_MATCH_CONFIDENCE,
    categoryHint: normalized.categoryHint,
  };
}

/**
 * Full merchant pipeline step: extract a merchant from a note, then
 * upsert it into the registry. This is the single function transaction
 * sources / the ingestion pipeline call — they never touch extraction,
 * normalization, or the registry directly.
 */
export function identifyMerchant(note: string): MerchantIdentification | undefined {
  const extraction = extractMerchant(note);
  if (!extraction) return undefined;

  const merchant = registerMerchant({
    canonicalName: extraction.name,
    categoryHint: extraction.categoryHint,
    confidence: extraction.confidence,
  });

  return {
    merchantId: merchant.id,
    merchantName: merchant.canonicalName,
    merchantConfidence: extraction.confidence,
  };
}
