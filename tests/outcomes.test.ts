import { describe, expect, it } from "vitest";
import { MIN_OUTCOMES, outcomeSummary, scoreBand, type OutcomeInput } from "../src/lib/outcomes.ts";

const app = (outcome: OutcomeInput["outcome"], score: number | null, exported: number | null = null): OutcomeInput => ({
  outcome,
  baseScore: score,
  exportScore: exported,
});

describe("score bands", () => {
  it("splits at 70 and 85", () => {
    expect(scoreBand(69)).toBe("below_70");
    expect(scoreBand(70)).toBe("70_84");
    expect(scoreBand(84)).toBe("70_84");
    expect(scoreBand(85)).toBe("85_plus");
  });
});

describe("outcome summary (F20)", () => {
  it(`is hidden until ${MIN_OUTCOMES} applications have an outcome`, () => {
    const nine = Array.from({ length: 9 }, () => app("applied", 60));
    const lots = [...nine, ...Array.from({ length: 20 }, () => app("not_applied", 90))];
    expect(outcomeSummary(lots).visible).toBe(false);
    expect(outcomeSummary(lots).withOutcome).toBe(9);
    expect(outcomeSummary([...nine, app("no_reply", 60)]).visible).toBe(true);
  });

  it("reports the share of applied applications reaching recruiter call or beyond, per final-score band", () => {
    const apps = [
      // below 70: 4 applied, 1 reached (interview)
      app("applied", 50),
      app("no_reply", 60),
      app("rejected", 65),
      app("interview", 68),
      // 70-84 by export score even though the base is low: 3 applied, 2 reached
      app("recruiter_call", 55, 72),
      app("offer", 60, 80),
      app("no_reply", 62, 75),
      // 85+: 3 applied, 1 reached
      app("recruiter_call", 90),
      app("rejected", 88),
      app("applied", 86),
      // not applied: ignored
      app("not_applied", 95),
    ];
    const s = outcomeSummary(apps);
    expect(s.visible).toBe(true);
    expect(s.bands).toEqual([
      { band: "below_70", label: "Below 70", applied: 4, reached: 1, share: 0.25 },
      { band: "70_84", label: "70 to 84", applied: 3, reached: 2, share: 2 / 3 },
      { band: "85_plus", label: "85 and above", applied: 3, reached: 1, share: 1 / 3 },
    ]);
  });

  it("gives a null share for a band with no applied applications, and skips unscored ones", () => {
    const apps = [...Array.from({ length: 10 }, () => app("applied", 50)), app("offer", null)];
    const s = outcomeSummary(apps);
    expect(s.bands.find((b) => b.band === "85_plus")).toMatchObject({ applied: 0, reached: 0, share: null });
    expect(s.bands.find((b) => b.band === "below_70")).toMatchObject({ applied: 10, reached: 0, share: 0 });
  });
});
