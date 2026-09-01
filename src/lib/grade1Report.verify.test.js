import { describe, it, expect } from "vitest";
import { buildGrade1Assessment, checkCompositeMismatch } from "./grade1Report";

// Regression coverage for the three-flag recommendation model (see
// grade1Report.js's file header for the full rationale). Grounded in a
// real case: a Grade 1 BOY composite of 90 (Well Below Benchmark) with a
// mostly-strong subtest profile, which the old composite-only model
// recommended "intensive intervention" for.

describe("composite-vs-formula mismatch check", () => {
  it("flags a stored composite that doesn't match this app's own formula", () => {
    const scoreRow = { grade: "1", period: "BOY", composite: 90, lnf: 29, psf: 33, nwf_cls: 47, nwf_wwr: 14 };
    const mismatch = checkCompositeMismatch("1", "BOY", scoreRow);
    expect(mismatch).toEqual({ stored: 90, expected: 109, diff: 19 });
  });

  it("doesn't flag a composite within a couple points of the formula", () => {
    const scoreRow = { grade: "1", period: "BOY", composite: 108, lnf: 29, psf: 33, nwf_cls: 47, nwf_wwr: 14 };
    expect(checkCompositeMismatch("1", "BOY", scoreRow)).toBeNull();
  });
});

describe("flag A — low across the board", () => {
  it("does NOT trigger when only one of three non-LNF subtests is below (mixed profile)", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 90, lnf: 29, psf: 33, nwf_cls: 47, nwf_wwr: 14 };
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    expect(a.flags.lowAcrossBoard).toBeNull();
    expect(a.recommendation.tier).not.toBe("Strong");
  });

  it("triggers Strong when composite is Well Below AND 2+ subtests are Below/Well Below", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 60, lnf: 20, psf: 15, nwf_cls: 10, nwf_wwr: 0 };
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    expect(a.recommendation.tier).toBe("Strong");
    expect(a.recommendation.days).toBe(4);
  });
});

describe("flag C — borderline (bottom 25% locally)", () => {
  it("lands on Watch (not Strong) for a composite that's Well Below nationally but only borderline locally", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 90, lnf: 29, psf: 33, nwf_cls: 47, nwf_wwr: 14 };
    const cohort = [200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 90, 80];
    const a = buildGrade1Assessment({
      grade: "1", period: "BOY", scoreRow, history: [scoreRow],
      localValuesByMeasure: { composite: cohort, psf: [], nwf_cls: [], nwf_wwr: [] },
    });
    expect(a.recommendation.tier).toBe("Watch");
    expect(a.recommendation.pmPlan.cadence).toBe("monthly");
  });
});

describe("flag B — single remediable area, retest then confirm", () => {
  const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", assessment_date: "2026-09-08", composite: 120, lnf: 45, psf: 15, nwf_cls: 40, nwf_wwr: 10 };

  it("recommends a retest, not intervention, when there's no follow-up data yet", () => {
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    expect(a.recommendation.tier).toBe("RetestNeeded");
    expect(a.recommendation.days).toBe(0);
  });

  it("escalates to a specific targeted intervention once a later PM confirms it's still low", () => {
    const pmScores = [{ assessment_date: "2026-09-22", psf: 16 }];
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], pmScores, localValuesByMeasure: {} });
    expect(a.recommendation.tier).toBe("Confirmed");
    expect(a.recommendation.reasoning).toContain("Orton-Gillingham");
  });

  it("drops the flag once a later PM comes back fine", () => {
    const pmScores = [{ assessment_date: "2026-09-22", psf: 42 }];
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], pmScores, localValuesByMeasure: {} });
    expect(a.recommendation.tier).toBe("None");
  });
});

describe("ORF (DIBELS 8, Grade 1 BOY) cuts both ways", () => {
  it("a strong ORF score doesn't get held down by an otherwise-poor profile's severity", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 60, lnf: 20, psf: 15, nwf_cls: 10, nwf_wwr: 0, orf_words: 40, orf_accuracy: 98 };
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    const orf = a.subtests.find((s) => s.measure === "orf_words");
    expect(orf.status.status).toBe("Above Benchmark");
  });

  it("a well-below ORF alone (composite fine) triggers a retest, not an automatic Strong", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 120, lnf: 45, psf: 45, nwf_cls: 40, nwf_wwr: 10, orf_words: 2, orf_accuracy: 100 };
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    expect(a.recommendation.tier).toBe("RetestNeeded");
  });

  it("an ORF score of 15 (At Benchmark under DIBELS 8) reads as on track, not a concern", () => {
    const scoreRow = { school_year: "2026-2027", grade: "1", period: "BOY", composite: 120, lnf: 45, psf: 45, nwf_cls: 40, nwf_wwr: 10, orf_words: 15, orf_accuracy: 98 };
    const a = buildGrade1Assessment({ grade: "1", period: "BOY", scoreRow, history: [scoreRow], localValuesByMeasure: {} });
    const orf = a.subtests.find((s) => s.measure === "orf_words");
    expect(orf.status.status).toBe("At Benchmark");
    expect(a.recommendation.tier).toBe("None");
  });
});
