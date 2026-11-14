import type { Category } from "./scoring.ts";

export type SuggestionType = "rewrite" | "keyword" | "quantify" | "unverified_keyword" | "format" | "hygiene";
export type SuggestionStatus = "open" | "accepted" | "skipped";

/** Placeholder a Quantify suggestion carries until the user types the metric. */
export const METRIC = "[metric]";

/** A stored suggestion row (CLAUDE.md section 7, plus migration 6 fields). */
export interface Suggestion {
  id: string;
  type: SuggestionType;
  category: Category;
  /** JSON pointer into cvs.structured. Pointing at an array means "append". "/_..." refs are template fixes. */
  section_ref: string;
  before_text: string;
  after_text: string;
  evidence_quote: string;
  points: number;
  status: SuggestionStatus;
  user_text: string | null;
  edited_text: string | null;
  rank: number;
  term: string;
  source: "model" | "user";
  confirmed: boolean;
}
