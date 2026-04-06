import { describe, it, expect } from "vitest";
import {
  getBenchmarkStatus,
  getAccuracyValue,
  calculateComposite,
  getThresholds,
  getMeasuresForGradePeriod,
  STATUS,
} from "./scoringEngine.js";

// ---------------------------------------------------------------------------
// getBenchmarkStatus
// ---------------------------------------------------------------------------
describe("getBenchmarkStatus", () => {
  // --- Kindergarten ---
  describe("Kindergarten", () => {
    it("returns null for K BOY (no BOY testing)", () => {
      expect(getBenchmarkStatus("K", "BOY", "composite", 100)).toBeNull();
    });

    it("K MOY composite: Above (>=156)", () => {
      expect(getBenchmarkStatus("K", "MOY", "composite", 200)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "MOY", "composite", 156)).toEqual(STATUS.ABOVE);
    });

    it("K MOY composite: At (122–155)", () => {
      expect(getBenchmarkStatus("K", "MOY", "composite", 155)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "MOY", "composite", 122)).toEqual(STATUS.AT);
    });

    it("K MOY composite: Below (85–121)", () => {
      expect(getBenchmarkStatus("K", "MOY", "composite", 121)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "MOY", "composite", 85)).toEqual(STATUS.BELOW);
    });

    it("K MOY composite: Well Below (<85)", () => {
      expect(getBenchmarkStatus("K", "MOY", "composite", 84)).toEqual(STATUS.WELL_BELOW);
      expect(getBenchmarkStatus("K", "MOY", "composite", 0)).toEqual(STATUS.WELL_BELOW);
    });

    it("K EOY composite thresholds", () => {
      expect(getBenchmarkStatus("K", "EOY", "composite", 152)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "EOY", "composite", 119)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "EOY", "composite", 89)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "EOY", "composite", 88)).toEqual(STATUS.WELL_BELOW);
    });

    it("K MOY fsf thresholds", () => {
      expect(getBenchmarkStatus("K", "MOY", "fsf", 43)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "MOY", "fsf", 30)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "MOY", "fsf", 20)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "MOY", "fsf", 19)).toEqual(STATUS.WELL_BELOW);
    });

    it("K MOY/EOY psf thresholds", () => {
      expect(getBenchmarkStatus("K", "MOY", "psf", 44)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "MOY", "psf", 20)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "MOY", "psf", 10)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "MOY", "psf", 9)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("K", "EOY", "psf", 56)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "EOY", "psf", 40)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "EOY", "psf", 25)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "EOY", "psf", 24)).toEqual(STATUS.WELL_BELOW);
    });

    it("K MOY/EOY nwf_cls thresholds", () => {
      expect(getBenchmarkStatus("K", "MOY", "nwf_cls", 28)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "MOY", "nwf_cls", 17)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "MOY", "nwf_cls", 8)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "MOY", "nwf_cls", 7)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("K", "EOY", "nwf_cls", 40)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("K", "EOY", "nwf_cls", 28)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("K", "EOY", "nwf_cls", 15)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("K", "EOY", "nwf_cls", 14)).toEqual(STATUS.WELL_BELOW);
    });

    it("lnf always returns null (risk indicator only)", () => {
      expect(getBenchmarkStatus("K", "MOY", "lnf", 50)).toBeNull();
      expect(getBenchmarkStatus("K", "EOY", "lnf", 50)).toBeNull();
      expect(getBenchmarkStatus("1", "BOY", "lnf", 50)).toBeNull();
    });
  });

  // --- Grade 1 ---
  describe("Grade 1", () => {
    it("G1 BOY composite", () => {
      expect(getBenchmarkStatus("1", "BOY", "composite", 129)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "BOY", "composite", 113)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "BOY", "composite", 97)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "BOY", "composite", 96)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 MOY composite", () => {
      expect(getBenchmarkStatus("1", "MOY", "composite", 177)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "MOY", "composite", 130)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "MOY", "composite", 100)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "MOY", "composite", 99)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 EOY composite", () => {
      expect(getBenchmarkStatus("1", "EOY", "composite", 208)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "composite", 155)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "EOY", "composite", 111)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "composite", 110)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 BOY psf", () => {
      expect(getBenchmarkStatus("1", "BOY", "psf", 47)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "BOY", "psf", 40)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "BOY", "psf", 25)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "BOY", "psf", 24)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 nwf_cls all periods", () => {
      expect(getBenchmarkStatus("1", "BOY", "nwf_cls", 34)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "BOY", "nwf_cls", 27)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "BOY", "nwf_cls", 18)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "BOY", "nwf_cls", 17)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("1", "MOY", "nwf_cls", 59)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "MOY", "nwf_cls", 43)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "MOY", "nwf_cls", 33)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "MOY", "nwf_cls", 32)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("1", "EOY", "nwf_cls", 81)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "nwf_cls", 58)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "EOY", "nwf_cls", 47)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "nwf_cls", 46)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 nwf_wwr all periods", () => {
      expect(getBenchmarkStatus("1", "BOY", "nwf_wwr", 4)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "BOY", "nwf_wwr", 1)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "BOY", "nwf_wwr", 0)).toEqual(STATUS.BELOW);

      expect(getBenchmarkStatus("1", "MOY", "nwf_wwr", 17)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "MOY", "nwf_wwr", 8)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "MOY", "nwf_wwr", 3)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "MOY", "nwf_wwr", 2)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("1", "EOY", "nwf_wwr", 25)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "nwf_wwr", 13)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "EOY", "nwf_wwr", 6)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "nwf_wwr", 5)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 MOY/EOY orf_words", () => {
      expect(getBenchmarkStatus("1", "MOY", "orf_words", 34)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "MOY", "orf_words", 23)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "MOY", "orf_words", 16)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "MOY", "orf_words", 15)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("1", "EOY", "orf_words", 67)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "orf_words", 47)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "EOY", "orf_words", 32)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "orf_words", 31)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 MOY/EOY orf_accuracy", () => {
      expect(getBenchmarkStatus("1", "MOY", "orf_accuracy", 86)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "MOY", "orf_accuracy", 78)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "MOY", "orf_accuracy", 68)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "MOY", "orf_accuracy", 67)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("1", "EOY", "orf_accuracy", 97)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "orf_accuracy", 90)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("1", "EOY", "orf_accuracy", 82)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "orf_accuracy", 81)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 EOY retell (no risk threshold)", () => {
      expect(getBenchmarkStatus("1", "EOY", "retell", 17)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("1", "EOY", "retell", 15)).toEqual(STATUS.AT);
      // risk is null, so below at → Below (lowest possible)
      expect(getBenchmarkStatus("1", "EOY", "retell", 14)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("1", "EOY", "retell", 0)).toEqual(STATUS.BELOW);
    });
  });

  // --- Grade 2 ---
  describe("Grade 2", () => {
    it("G2 BOY/MOY/EOY composite", () => {
      expect(getBenchmarkStatus("2", "BOY", "composite", 202)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "BOY", "composite", 141)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("2", "BOY", "composite", 109)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("2", "BOY", "composite", 108)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("2", "MOY", "composite", 256)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "MOY", "composite", 190)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("2", "MOY", "composite", 145)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("2", "MOY", "composite", 144)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("2", "EOY", "composite", 287)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "EOY", "composite", 238)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("2", "EOY", "composite", 180)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("2", "EOY", "composite", 179)).toEqual(STATUS.WELL_BELOW);
    });

    it("G2 retell_quality (no above threshold)", () => {
      // above is null, so max status is AT
      expect(getBenchmarkStatus("2", "MOY", "retell_quality", 3)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("2", "MOY", "retell_quality", 2)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("2", "MOY", "retell_quality", 1)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("2", "MOY", "retell_quality", 0)).toEqual(STATUS.WELL_BELOW);
    });

    it("G2 BOY orf_words/accuracy/retell/nwf", () => {
      expect(getBenchmarkStatus("2", "BOY", "orf_words", 68)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "BOY", "orf_accuracy", 96)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "BOY", "retell", 25)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "BOY", "nwf_cls", 72)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("2", "BOY", "nwf_wwr", 21)).toEqual(STATUS.ABOVE);
    });
  });

  // --- Grade 3 ---
  describe("Grade 3", () => {
    it("G3 all periods composite", () => {
      expect(getBenchmarkStatus("3", "BOY", "composite", 289)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("3", "BOY", "composite", 220)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("3", "BOY", "composite", 180)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("3", "BOY", "composite", 179)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("3", "MOY", "composite", 349)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("3", "EOY", "composite", 405)).toEqual(STATUS.ABOVE);
    });

    it("G3 maze thresholds", () => {
      expect(getBenchmarkStatus("3", "BOY", "maze", 11)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("3", "BOY", "maze", 8)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("3", "BOY", "maze", 5)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("3", "BOY", "maze", 4)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("3", "MOY", "maze", 16)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("3", "EOY", "maze", 23)).toEqual(STATUS.ABOVE);
    });

    it("G3 retell_quality with varying above=null", () => {
      expect(getBenchmarkStatus("3", "BOY", "retell_quality", 3)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("3", "EOY", "retell_quality", 3)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("3", "EOY", "retell_quality", 2)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("3", "EOY", "retell_quality", 1)).toEqual(STATUS.WELL_BELOW);
    });
  });

  // --- Grade 4 ---
  describe("Grade 4", () => {
    it("G4 all periods composite", () => {
      expect(getBenchmarkStatus("4", "BOY", "composite", 341)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "BOY", "composite", 290)).toEqual(STATUS.AT);
      expect(getBenchmarkStatus("4", "BOY", "composite", 245)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("4", "BOY", "composite", 244)).toEqual(STATUS.WELL_BELOW);

      expect(getBenchmarkStatus("4", "MOY", "composite", 383)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "EOY", "composite", 446)).toEqual(STATUS.ABOVE);
    });

    it("G4 orf_words all periods", () => {
      expect(getBenchmarkStatus("4", "BOY", "orf_words", 104)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "MOY", "orf_words", 121)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "EOY", "orf_words", 133)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "EOY", "orf_words", 95)).toEqual(STATUS.BELOW);
      expect(getBenchmarkStatus("4", "EOY", "orf_words", 94)).toEqual(STATUS.WELL_BELOW);
    });

    it("G4 maze all periods", () => {
      expect(getBenchmarkStatus("4", "BOY", "maze", 18)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "MOY", "maze", 20)).toEqual(STATUS.ABOVE);
      expect(getBenchmarkStatus("4", "EOY", "maze", 28)).toEqual(STATUS.ABOVE);
    });
  });

  // --- Edge cases ---
  describe("Edge cases", () => {
    it("returns null for null/undefined/NaN score", () => {
      expect(getBenchmarkStatus("1", "BOY", "composite", null)).toBeNull();
      expect(getBenchmarkStatus("1", "BOY", "composite", undefined)).toBeNull();
      expect(getBenchmarkStatus("1", "BOY", "composite", NaN)).toBeNull();
    });

    it("returns null for invalid grade/period/measure", () => {
      expect(getBenchmarkStatus("9", "BOY", "composite", 100)).toBeNull();
      expect(getBenchmarkStatus("1", "XYZ", "composite", 100)).toBeNull();
      expect(getBenchmarkStatus("1", "BOY", "nonexistent", 100)).toBeNull();
    });

    it("returns null for wrf_historical (not a benchmark measure)", () => {
      expect(getBenchmarkStatus("1", "BOY", "wrf_historical", 50)).toBeNull();
    });

    it("handles boundary scores exactly at thresholds", () => {
      // Exactly at "above" → Above
      expect(getBenchmarkStatus("1", "BOY", "composite", 129)).toEqual(STATUS.ABOVE);
      // One below "above" → At
      expect(getBenchmarkStatus("1", "BOY", "composite", 128)).toEqual(STATUS.AT);
      // Exactly at "at" → At
      expect(getBenchmarkStatus("1", "BOY", "composite", 113)).toEqual(STATUS.AT);
      // One below "at" → Below
      expect(getBenchmarkStatus("1", "BOY", "composite", 112)).toEqual(STATUS.BELOW);
      // Exactly at "risk" → Below
      expect(getBenchmarkStatus("1", "BOY", "composite", 97)).toEqual(STATUS.BELOW);
      // One below "risk" → Well Below
      expect(getBenchmarkStatus("1", "BOY", "composite", 96)).toEqual(STATUS.WELL_BELOW);
    });

    it("G1 BOY nwf_wwr: risk=0, score of 0 is Below (at threshold)", () => {
      // risk is 0, at is 1, above is 4
      // score 0 >= risk(0) → Below
      expect(getBenchmarkStatus("1", "BOY", "nwf_wwr", 0)).toEqual(STATUS.BELOW);
    });
  });
});

// ---------------------------------------------------------------------------
// getAccuracyValue
// ---------------------------------------------------------------------------
describe("getAccuracyValue", () => {
  describe("Grade 1 MOY", () => {
    it("returns 0 for very low accuracy", () => {
      expect(getAccuracyValue("1", "MOY", 40)).toBe(0);
      expect(getAccuracyValue("1", "MOY", 49)).toBe(0);
    });

    it("returns correct values at range boundaries", () => {
      expect(getAccuracyValue("1", "MOY", 50)).toBe(2);
      expect(getAccuracyValue("1", "MOY", 52)).toBe(2);
      expect(getAccuracyValue("1", "MOY", 53)).toBe(8);
      expect(getAccuracyValue("1", "MOY", 68)).toBe(38);
      expect(getAccuracyValue("1", "MOY", 80)).toBe(62);
      expect(getAccuracyValue("1", "MOY", 95)).toBe(92);
      expect(getAccuracyValue("1", "MOY", 98)).toBe(98);
      expect(getAccuracyValue("1", "MOY", 100)).toBe(98);
    });
  });

  describe("Grade 1 EOY / Grade 2 BOY", () => {
    it("returns 0 below 65%", () => {
      expect(getAccuracyValue("1", "EOY", 64)).toBe(0);
      expect(getAccuracyValue("2", "BOY", 0)).toBe(0);
    });

    it("returns correct values", () => {
      expect(getAccuracyValue("1", "EOY", 65)).toBe(3);
      expect(getAccuracyValue("2", "BOY", 65)).toBe(3);
      expect(getAccuracyValue("1", "EOY", 80)).toBe(45);
      expect(getAccuracyValue("1", "EOY", 96)).toBe(93);
      expect(getAccuracyValue("1", "EOY", 97)).toBe(99);
      expect(getAccuracyValue("1", "EOY", 99)).toBe(105);
      expect(getAccuracyValue("1", "EOY", 100)).toBe(105);
    });
  });

  describe("Grades 2 MOY+ through 6", () => {
    it("returns 0 below 86%", () => {
      expect(getAccuracyValue("2", "MOY", 85)).toBe(0);
      expect(getAccuracyValue("3", "BOY", 50)).toBe(0);
    });

    it("returns (pct-85)*8 for 86–100", () => {
      expect(getAccuracyValue("2", "MOY", 86)).toBe(8);
      expect(getAccuracyValue("2", "MOY", 90)).toBe(40);
      expect(getAccuracyValue("3", "BOY", 95)).toBe(80);
      expect(getAccuracyValue("4", "EOY", 100)).toBe(120);
      expect(getAccuracyValue("6", "MOY", 100)).toBe(120);
    });
  });

  it("returns 0 for null/NaN", () => {
    expect(getAccuracyValue("2", "MOY", null)).toBe(0);
    expect(getAccuracyValue("2", "MOY", NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateComposite
// ---------------------------------------------------------------------------
describe("calculateComposite", () => {
  describe("Kindergarten", () => {
    it("MOY: lnf + psf + nwf_cls", () => {
      expect(calculateComposite("K", "MOY", { lnf: 40, psf: 30, nwf_cls: 20 })).toBe(90);
    });

    it("EOY: lnf + psf + nwf_cls", () => {
      expect(calculateComposite("K", "EOY", { lnf: 50, psf: 40, nwf_cls: 30 })).toBe(120);
    });

    it("returns null if any component missing", () => {
      expect(calculateComposite("K", "MOY", { lnf: 40, psf: 30 })).toBeNull();
      expect(calculateComposite("K", "MOY", { lnf: 40, nwf_cls: 20 })).toBeNull();
    });

    it("returns null for BOY (no K BOY)", () => {
      expect(calculateComposite("K", "BOY", { lnf: 40, psf: 30, nwf_cls: 20 })).toBeNull();
    });
  });

  describe("Grade 1 BOY", () => {
    it("lnf + psf + nwf_cls", () => {
      expect(calculateComposite("1", "BOY", { lnf: 25, psf: 40, nwf_cls: 30 })).toBe(95);
    });
  });

  describe("Grade 1 MOY", () => {
    it("nwf_cls + nwf_wwr + orf_words + accuracy_value", () => {
      // accuracy 80% → value 62 (G1 MOY table)
      const result = calculateComposite("1", "MOY", {
        nwf_cls: 43, nwf_wwr: 8, orf_words: 23, orf_accuracy: 80,
      });
      expect(result).toBe(43 + 8 + 23 + 62); // 136
    });

    it("returns null if missing component", () => {
      expect(calculateComposite("1", "MOY", {
        nwf_cls: 43, nwf_wwr: 8, orf_words: 23,
      })).toBeNull();
    });
  });

  describe("Grade 1 EOY", () => {
    it("nwf_wwr*2 + orf_words + accuracy_value", () => {
      // accuracy 90% → value 75 (G1 EOY table)
      const result = calculateComposite("1", "EOY", {
        nwf_wwr: 13, orf_words: 47, orf_accuracy: 90,
      });
      expect(result).toBe(13 * 2 + 47 + 75); // 148
    });
  });

  describe("Grade 2 BOY", () => {
    it("nwf_wwr*2 + orf_words + accuracy_value", () => {
      // accuracy 90% → value 75 (G1 EOY / G2 BOY table)
      const result = calculateComposite("2", "BOY", {
        nwf_wwr: 13, orf_words: 52, orf_accuracy: 90,
      });
      expect(result).toBe(13 * 2 + 52 + 75); // 153
    });
  });

  describe("Grade 2 MOY/EOY", () => {
    it("orf_words + retell*2 + accuracy_value", () => {
      // accuracy 96% → value 88 (G2+ table)
      const result = calculateComposite("2", "MOY", {
        orf_words: 72, retell: 21, orf_accuracy: 96,
      });
      expect(result).toBe(72 + 21 * 2 + 88); // 202
    });

    it("uses retell=0 if orf_words < 40 and retell missing", () => {
      // accuracy 91% → value 48
      const result = calculateComposite("2", "MOY", {
        orf_words: 30, orf_accuracy: 91,
      });
      expect(result).toBe(30 + 0 + 48); // 78
    });

    it("returns null if orf_words >= 40 and retell missing", () => {
      expect(calculateComposite("2", "MOY", {
        orf_words: 50, orf_accuracy: 96,
      })).toBeNull();
    });
  });

  describe("Grades 3–6", () => {
    it("G3: orf_words + retell*2 + maze*4 + accuracy_value", () => {
      // accuracy 95% → value 80
      const result = calculateComposite("3", "BOY", {
        orf_words: 70, retell: 20, maze: 8, orf_accuracy: 95,
      });
      expect(result).toBe(70 + 20 * 2 + 8 * 4 + 80); // 222
    });

    it("G4: same formula", () => {
      // accuracy 97% → value 96
      const result = calculateComposite("4", "MOY", {
        orf_words: 103, retell: 30, maze: 17, orf_accuracy: 97,
      });
      expect(result).toBe(103 + 30 * 2 + 17 * 4 + 96); // 327
    });

    it("G3: uses retell=0 if orf_words < 40 and retell missing", () => {
      // accuracy 89% → value 32
      const result = calculateComposite("3", "BOY", {
        orf_words: 20, maze: 5, orf_accuracy: 89,
      });
      expect(result).toBe(20 + 0 + 5 * 4 + 32); // 72
    });

    it("returns null if maze missing", () => {
      expect(calculateComposite("3", "BOY", {
        orf_words: 70, retell: 20, orf_accuracy: 95,
      })).toBeNull();
    });

    it("G5 and G6 use same formula", () => {
      // G5 accuracy 98% → value 104
      const result5 = calculateComposite("5", "BOY", {
        orf_words: 111, retell: 33, maze: 18, orf_accuracy: 98,
      });
      expect(result5).toBe(111 + 33 * 2 + 18 * 4 + 104); // 353

      // G6 accuracy 100% → value 120
      const result6 = calculateComposite("6", "EOY", {
        orf_words: 120, retell: 32, maze: 21, orf_accuracy: 100,
      });
      expect(result6).toBe(120 + 32 * 2 + 21 * 4 + 120); // 388
    });
  });

  describe("Edge cases", () => {
    it("handles zero scores", () => {
      expect(calculateComposite("K", "MOY", { lnf: 0, psf: 0, nwf_cls: 0 })).toBe(0);
    });

    it("returns null for grade 7+", () => {
      expect(calculateComposite("7", "BOY", { orf_words: 100 })).toBeNull();
    });

    it("handles string numbers in scores object", () => {
      expect(calculateComposite("K", "MOY", { lnf: "40", psf: "30", nwf_cls: "20" })).toBe(90);
    });
  });
});

// ---------------------------------------------------------------------------
// getThresholds
// ---------------------------------------------------------------------------
describe("getThresholds", () => {
  it("returns thresholds for valid combo", () => {
    const t = getThresholds("K", "MOY", "composite");
    expect(t).toEqual({ above: 156, at: 122, risk: 85 });
  });

  it("returns null for invalid combo", () => {
    expect(getThresholds("K", "BOY", "composite")).toBeNull();
    expect(getThresholds("9", "BOY", "composite")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMeasuresForGradePeriod
// ---------------------------------------------------------------------------
describe("getMeasuresForGradePeriod", () => {
  it("K MOY includes fsf, lnf, psf, nwf_cls", () => {
    expect(getMeasuresForGradePeriod("K", "MOY")).toEqual([
      "composite", "fsf", "lnf", "psf", "nwf_cls",
    ]);
  });

  it("K EOY: no fsf", () => {
    expect(getMeasuresForGradePeriod("K", "EOY")).toEqual([
      "composite", "lnf", "psf", "nwf_cls",
    ]);
  });

  it("K BOY: null (no testing)", () => {
    expect(getMeasuresForGradePeriod("K", "BOY")).toBeNull();
  });

  it("G1 BOY has lnf, psf, nwf_cls, nwf_wwr", () => {
    expect(getMeasuresForGradePeriod("1", "BOY")).toEqual([
      "composite", "lnf", "psf", "nwf_cls", "nwf_wwr",
    ]);
  });

  it("G3 BOY has orf_words, orf_accuracy, retell, retell_quality, maze", () => {
    expect(getMeasuresForGradePeriod("3", "BOY")).toEqual([
      "composite", "orf_words", "orf_accuracy", "retell", "retell_quality", "maze",
    ]);
  });

  it("returns null for invalid input", () => {
    expect(getMeasuresForGradePeriod("9", "BOY")).toBeNull();
    expect(getMeasuresForGradePeriod("1", "XYZ")).toBeNull();
  });
});
