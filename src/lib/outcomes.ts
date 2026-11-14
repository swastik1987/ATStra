/**
 * F20: share of applied applications that reached a recruiter call or beyond, by final score
 * band. Pure. It exists to test whether the score has any link to shortlisting (section 14).
 */
export type Outcome = "not_applied" | "applied" | "no_reply" | "recruiter_call" | "interview" | "offer" | "rejected";
export type Band = "below_70" | "70_84" | "85_plus";

export const MIN_OUTCOMES = 10;
const REACHED: Outcome[] = ["recruiter_call", "interview", "offer"];
const BANDS: { band: Band; label: string }[] = [
  { band: "below_70", label: "Below 70" },
  { band: "70_84", label: "70 to 84" },
  { band: "85_plus", label: "85 and above" },
];

export interface OutcomeInput {
  outcome: Outcome;
  baseScore: number | null;
  /** Score recomputed from the latest export, if any. This is the final score. */
  exportScore: number | null;
}

export interface BandSummary {
  band: Band;
  label: string;
  applied: number;
  reached: number;
  share: number | null;
}

export function scoreBand(score: number): Band {
  return score < 70 ? "below_70" : score < 85 ? "70_84" : "85_plus";
}

export function outcomeSummary(apps: OutcomeInput[]): { visible: boolean; withOutcome: number; bands: BandSummary[] } {
  const applied = apps.filter((a) => a.outcome !== "not_applied");
  const bands = BANDS.map(({ band, label }) => {
    const inBand = applied.filter((a) => {
      const score = a.exportScore ?? a.baseScore;
      return score !== null && scoreBand(score) === band;
    });
    const reached = inBand.filter((a) => REACHED.includes(a.outcome)).length;
    return { band, label, applied: inBand.length, reached, share: inBand.length ? reached / inBand.length : null };
  });
  return { visible: applied.length >= MIN_OUTCOMES, withOutcome: applied.length, bands };
}
