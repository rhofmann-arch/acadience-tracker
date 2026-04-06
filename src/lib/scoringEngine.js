/**
 * Acadience Reading Scoring Engine
 *
 * Core functions:
 *   getBenchmarkStatus(grade, period, measure, score)  → { status, color } | null
 *   calculateComposite(grade, period, scores)          → number | null
 *   getAccuracyValue(grade, period, accuracy)          → number
 *
 * All benchmark thresholds come from the BenchmarkRef data (Acadience K–6
 * Assessment Manual, Appendix C). The ref table is passed in at init or
 * looked up from the static BENCHMARK_REF constant.
 */

// ---------------------------------------------------------------------------
// Status definitions
// ---------------------------------------------------------------------------
export const STATUS = {
  ABOVE: { status: "Above Benchmark", color: "#1D9E75" },
  AT: { status: "At Benchmark", color: "#1D9E75" },
  BELOW: { status: "Below Benchmark", color: "#EF9F27" },
  WELL_BELOW: { status: "Well Below Benchmark", color: "#D85A30" },
};

// ---------------------------------------------------------------------------
// BenchmarkRef — static lookup table
// Each entry: [grade, period, measure, above, at, risk]
// Empty string means "not applicable for this threshold" (e.g., retell_quality
// has no "above" threshold; lnf has no benchmark goals at all).
// ---------------------------------------------------------------------------
export const BENCHMARK_REF = [
  // Kindergarten (no BOY)
  ["K", "MOY", "composite", 156, 122, 85],
  ["K", "EOY", "composite", 152, 119, 89],
  ["K", "MOY", "fsf", 43, 30, 20],
  ["K", "MOY", "psf", 44, 20, 10],
  ["K", "EOY", "psf", 56, 40, 25],
  ["K", "MOY", "nwf_cls", 28, 17, 8],
  ["K", "EOY", "nwf_cls", 40, 28, 15],

  // Grade 1
  ["1", "BOY", "composite", 129, 113, 97],
  ["1", "MOY", "composite", 177, 130, 100],
  ["1", "EOY", "composite", 208, 155, 111],
  ["1", "BOY", "psf", 47, 40, 25],
  ["1", "BOY", "nwf_cls", 34, 27, 18],
  ["1", "MOY", "nwf_cls", 59, 43, 33],
  ["1", "EOY", "nwf_cls", 81, 58, 47],
  ["1", "BOY", "nwf_wwr", 4, 1, 0],
  ["1", "MOY", "nwf_wwr", 17, 8, 3],
  ["1", "EOY", "nwf_wwr", 25, 13, 6],
  ["1", "MOY", "orf_words", 34, 23, 16],
  ["1", "EOY", "orf_words", 67, 47, 32],
  ["1", "MOY", "orf_accuracy", 86, 78, 68],
  ["1", "EOY", "orf_accuracy", 97, 90, 82],
  ["1", "EOY", "retell", 17, 15, null],

  // Grade 2
  ["2", "BOY", "composite", 202, 141, 109],
  ["2", "MOY", "composite", 256, 190, 145],
  ["2", "EOY", "composite", 287, 238, 180],
  ["2", "BOY", "nwf_cls", 72, 54, 35],
  ["2", "BOY", "nwf_wwr", 21, 13, 6],
  ["2", "BOY", "orf_words", 68, 52, 37],
  ["2", "MOY", "orf_words", 91, 72, 55],
  ["2", "EOY", "orf_words", 104, 87, 65],
  ["2", "BOY", "orf_accuracy", 96, 90, 81],
  ["2", "MOY", "orf_accuracy", 99, 96, 91],
  ["2", "EOY", "orf_accuracy", 99, 97, 93],
  ["2", "BOY", "retell", 25, 16, 8],
  ["2", "MOY", "retell", 31, 21, 13],
  ["2", "EOY", "retell", 39, 27, 18],
  ["2", "MOY", "retell_quality", null, 2, 1],
  ["2", "EOY", "retell_quality", null, 2, 1],

  // Grade 3
  ["3", "BOY", "composite", 289, 220, 180],
  ["3", "MOY", "composite", 349, 285, 235],
  ["3", "EOY", "composite", 405, 330, 280],
  ["3", "BOY", "orf_words", 90, 70, 55],
  ["3", "MOY", "orf_words", 105, 86, 68],
  ["3", "EOY", "orf_words", 118, 100, 80],
  ["3", "BOY", "orf_accuracy", 98, 95, 89],
  ["3", "MOY", "orf_accuracy", 99, 96, 92],
  ["3", "EOY", "orf_accuracy", 99, 97, 94],
  ["3", "BOY", "retell", 33, 20, 10],
  ["3", "MOY", "retell", 40, 26, 18],
  ["3", "EOY", "retell", 46, 30, 20],
  ["3", "BOY", "retell_quality", null, 2, 1],
  ["3", "MOY", "retell_quality", null, 2, 1],
  ["3", "EOY", "retell_quality", null, 3, 2],
  ["3", "BOY", "maze", 11, 8, 5],
  ["3", "MOY", "maze", 16, 11, 7],
  ["3", "EOY", "maze", 23, 19, 14],

  // Grade 4
  ["4", "BOY", "composite", 341, 290, 245],
  ["4", "MOY", "composite", 383, 330, 290],
  ["4", "EOY", "composite", 446, 391, 330],
  ["4", "BOY", "orf_words", 104, 90, 70],
  ["4", "MOY", "orf_words", 121, 103, 79],
  ["4", "EOY", "orf_words", 133, 115, 95],
  ["4", "BOY", "orf_accuracy", 98, 96, 93],
  ["4", "MOY", "orf_accuracy", 99, 97, 94],
  ["4", "EOY", "orf_accuracy", 100, 98, 95],
  ["4", "BOY", "retell", 36, 27, 14],
  ["4", "MOY", "retell", 39, 30, 20],
  ["4", "EOY", "retell", 46, 33, 24],
  ["4", "BOY", "retell_quality", null, 2, 1],
  ["4", "MOY", "retell_quality", null, 2, 1],
  ["4", "EOY", "retell_quality", null, 3, 2],
  ["4", "BOY", "maze", 18, 15, 10],
  ["4", "MOY", "maze", 20, 17, 12],
  ["4", "EOY", "maze", 28, 24, 20],

  // Grade 5
  ["5", "BOY", "composite", 386, 357, 258],
  ["5", "MOY", "composite", 411, 372, 310],
  ["5", "EOY", "composite", 466, 415, 340],
  ["5", "BOY", "orf_words", 121, 111, 96],
  ["5", "MOY", "orf_words", 133, 120, 101],
  ["5", "EOY", "orf_words", 143, 130, 105],
  ["5", "BOY", "orf_accuracy", 99, 98, 95],
  ["5", "MOY", "orf_accuracy", 99, 98, 96],
  ["5", "EOY", "orf_accuracy", 100, 99, 97],
  ["5", "BOY", "retell", 40, 33, 22],
  ["5", "MOY", "retell", 46, 36, 25],
  ["5", "EOY", "retell", 52, 36, 25],
  ["5", "BOY", "retell_quality", null, 2, 1],
  ["5", "MOY", "retell_quality", null, 3, 2],
  ["5", "EOY", "retell_quality", null, 3, 2],
  ["5", "BOY", "maze", 21, 18, 12],
  ["5", "MOY", "maze", 21, 20, 13],
  ["5", "EOY", "maze", 28, 24, 18],

  // Grade 6
  ["6", "BOY", "composite", 435, 344, 280],
  ["6", "MOY", "composite", 461, 358, 285],
  ["6", "EOY", "composite", 478, 380, 324],
  ["6", "BOY", "orf_words", 139, 107, 90],
  ["6", "MOY", "orf_words", 141, 109, 92],
  ["6", "EOY", "orf_words", 151, 120, 95],
  ["6", "BOY", "orf_accuracy", 99, 97, 94],
  ["6", "MOY", "orf_accuracy", 99, 97, 94],
  ["6", "EOY", "orf_accuracy", 100, 98, 96],
  ["6", "BOY", "retell", 43, 27, 16],
  ["6", "MOY", "retell", 48, 29, 18],
  ["6", "EOY", "retell", 50, 32, 24],
  ["6", "BOY", "retell_quality", null, 2, 1],
  ["6", "MOY", "retell_quality", null, 2, 1],
  ["6", "EOY", "retell_quality", null, 3, 2],
  ["6", "BOY", "maze", 27, 18, 14],
  ["6", "MOY", "maze", 30, 19, 14],
  ["6", "EOY", "maze", 30, 21, 15],
];

// Build a fast lookup map: "grade|period|measure" → { above, at, risk }
const _refMap = new Map();
for (const [grade, period, measure, above, at, risk] of BENCHMARK_REF) {
  _refMap.set(`${grade}|${period}|${measure}`, { above, at, risk });
}

/**
 * Look up benchmark thresholds for a given grade/period/measure.
 * Returns { above, at, risk } or null if not applicable.
 */
export function getThresholds(grade, period, measure) {
  return _refMap.get(`${grade}|${period}|${measure}`) || null;
}

/**
 * Convert an mClass benchmark level string to a status object.
 * Used as a fallback for historical data where we can't calculate
 * the Acadience composite (retell not collected).
 */
export function mclassLevelToStatus(level) {
  if (!level) return null;
  const l = level.toLowerCase();
  if (l.includes("above")) return { ...STATUS.ABOVE };
  if (l.includes("at")) return { ...STATUS.AT };
  if (l.includes("well below")) return { ...STATUS.WELL_BELOW };
  if (l.includes("below")) return { ...STATUS.BELOW };
  return null;
}

/**
 * Determine benchmark status for a single score.
 *
 * @param {string} grade - "K", "1", "2", "3", "4", "5", "6"
 * @param {string} period - "BOY", "MOY", "EOY"
 * @param {string} measure - e.g., "composite", "orf_words", "psf"
 * @param {number} score - the raw score
 * @returns {{ status: string, color: string }} or null if not applicable
 */
export function getBenchmarkStatus(grade, period, measure, score) {
  // lnf is a risk indicator only — no benchmark status
  if (measure === "lnf") return null;

  const ref = getThresholds(grade, period, measure);
  if (!ref) return null;

  if (score == null || isNaN(score)) return null;

  // For measures with no "above" threshold (retell_quality), above is null
  if (ref.above != null && score >= ref.above) {
    return { ...STATUS.ABOVE };
  }
  if (score >= ref.at) {
    return { ...STATUS.AT };
  }
  // For measures with no "risk" threshold, below risk is not applicable
  if (ref.risk != null && score >= ref.risk) {
    return { ...STATUS.BELOW };
  }
  if (ref.risk != null) {
    return { ...STATUS.WELL_BELOW };
  }
  // If risk is null (e.g., G1 EOY retell), Below is the lowest we can go
  return { ...STATUS.BELOW };
}

// ---------------------------------------------------------------------------
// ORF Accuracy → Composite Point Value lookup tables
// ---------------------------------------------------------------------------

/**
 * Grade 1 MOY accuracy → composite point value.
 */
function accuracyValue_G1_MOY(pct) {
  if (pct < 50) return 0;
  if (pct <= 52) return 2;
  if (pct <= 55) return 8;
  if (pct <= 58) return 14;
  if (pct <= 61) return 20;
  if (pct <= 64) return 26;
  if (pct <= 67) return 32;
  if (pct <= 70) return 38;
  if (pct <= 73) return 44;
  if (pct <= 76) return 50;
  if (pct <= 79) return 56;
  if (pct <= 82) return 62;
  if (pct <= 85) return 68;
  if (pct <= 88) return 74;
  if (pct <= 91) return 80;
  if (pct <= 94) return 86;
  if (pct <= 97) return 92;
  return 98; // 98–100
}

/**
 * Grade 1 EOY / Grade 2 BOY accuracy → composite point value.
 */
function accuracyValue_G1EOY_G2BOY(pct) {
  if (pct < 65) return 0;
  if (pct <= 66) return 3;
  if (pct <= 68) return 9;
  if (pct <= 70) return 15;
  if (pct <= 72) return 21;
  if (pct <= 74) return 27;
  if (pct <= 76) return 33;
  if (pct <= 78) return 39;
  if (pct <= 80) return 45;
  if (pct <= 82) return 51;
  if (pct <= 84) return 57;
  if (pct <= 86) return 63;
  if (pct <= 88) return 69;
  if (pct <= 90) return 75;
  if (pct <= 92) return 81;
  if (pct <= 94) return 87;
  if (pct <= 96) return 93;
  if (pct <= 98) return 99;
  return 105; // 99-100
}

/**
 * Grades 2 MOY/EOY through Grade 6 accuracy → composite point value.
 */
function accuracyValue_G2plus(pct) {
  if (pct < 86) return 0;
  return (pct - 85) * 8; // 86→8, 87→16, ..., 100→120
}

/**
 * Get the composite point value for an ORF accuracy percentage.
 *
 * @param {string} grade - "1", "2", "3", "4", "5", "6"
 * @param {string} period - "BOY", "MOY", "EOY"
 * @param {number} accuracy - integer percentage (e.g., 94)
 * @returns {number} composite point value
 */
export function getAccuracyValue(grade, period, accuracy) {
  if (accuracy == null || isNaN(accuracy)) return 0;
  const pct = Math.round(accuracy);

  if (grade === "1" && period === "MOY") {
    return accuracyValue_G1_MOY(pct);
  }
  if ((grade === "1" && period === "EOY") || (grade === "2" && period === "BOY")) {
    return accuracyValue_G1EOY_G2BOY(pct);
  }
  // Grades 2 MOY/EOY, 3–6 all periods
  return accuracyValue_G2plus(pct);
}

// ---------------------------------------------------------------------------
// Composite score calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the composite score from raw sub-scores.
 *
 * @param {string} grade - "K", "1", "2", "3", "4", "5", "6"
 * @param {string} period - "BOY", "MOY", "EOY"
 * @param {object} scores - { lnf, psf, nwf_cls, nwf_wwr, orf_words,
 *                            orf_accuracy, retell, maze }
 * @returns {number|null} calculated composite, or null if required scores missing
 */
export function calculateComposite(grade, period, scores) {
  const s = (key) => {
    const v = scores[key];
    return v != null && !isNaN(v) ? Number(v) : null;
  };

  // Kindergarten: composite = lnf + psf + nwf_cls (MOY and EOY only)
  if (grade === "K") {
    if (period === "BOY") return null; // No K BOY testing
    const lnf = s("lnf");
    const psf = s("psf");
    const nwf_cls = s("nwf_cls");
    if (lnf == null || psf == null || nwf_cls == null) return null;
    return lnf + psf + nwf_cls;
  }

  // Grade 1 BOY: composite = lnf + psf + nwf_cls
  if (grade === "1" && period === "BOY") {
    const lnf = s("lnf");
    const psf = s("psf");
    const nwf_cls = s("nwf_cls");
    if (lnf == null || psf == null || nwf_cls == null) return null;
    return lnf + psf + nwf_cls;
  }

  // Grade 1 MOY: composite = nwf_cls + nwf_wwr + orf_words + accuracy_value
  if (grade === "1" && period === "MOY") {
    const nwf_cls = s("nwf_cls");
    const nwf_wwr = s("nwf_wwr");
    const orf_words = s("orf_words");
    const orf_accuracy = s("orf_accuracy");
    if (nwf_cls == null || nwf_wwr == null || orf_words == null || orf_accuracy == null) {
      return null;
    }
    return nwf_cls + nwf_wwr + orf_words + getAccuracyValue("1", "MOY", orf_accuracy);
  }

  // Grade 1 EOY: composite = nwf_wwr×2 + orf_words + accuracy_value
  if (grade === "1" && period === "EOY") {
    const nwf_wwr = s("nwf_wwr");
    const orf_words = s("orf_words");
    const orf_accuracy = s("orf_accuracy");
    if (nwf_wwr == null || orf_words == null || orf_accuracy == null) return null;
    return nwf_wwr * 2 + orf_words + getAccuracyValue("1", "EOY", orf_accuracy);
  }

  // Grade 2 BOY: composite = nwf_wwr×2 + orf_words + accuracy_value
  if (grade === "2" && period === "BOY") {
    const nwf_wwr = s("nwf_wwr");
    const orf_words = s("orf_words");
    const orf_accuracy = s("orf_accuracy");
    if (nwf_wwr == null || orf_words == null || orf_accuracy == null) return null;
    return nwf_wwr * 2 + orf_words + getAccuracyValue("2", "BOY", orf_accuracy);
  }

  // Grade 2 MOY/EOY: composite = orf_words + retell×2 + accuracy_value
  // If orf_words < 40 and retell not administered, use 0 for retell
  if (grade === "2" && (period === "MOY" || period === "EOY")) {
    const orf_words = s("orf_words");
    const orf_accuracy = s("orf_accuracy");
    let retell = s("retell");
    if (orf_words == null || orf_accuracy == null) return null;
    if (retell == null) {
      retell = orf_words < 40 ? 0 : null;
    }
    if (retell == null) return null;
    return orf_words + retell * 2 + getAccuracyValue("2", period, orf_accuracy);
  }

  // Grades 3–6 all periods: composite = orf_words + retell×2 + maze×4 + accuracy_value
  // If orf_words < 40 and retell not administered, use 0 for retell
  const gradeNum = parseInt(grade);
  if (gradeNum >= 3 && gradeNum <= 6) {
    const orf_words = s("orf_words");
    const orf_accuracy = s("orf_accuracy");
    const maze = s("maze");
    let retell = s("retell");
    if (orf_words == null || orf_accuracy == null || maze == null) return null;
    if (retell == null) {
      retell = orf_words < 40 ? 0 : null;
    }
    if (retell == null) return null;
    return orf_words + retell * 2 + maze * 4 + getAccuracyValue(grade, period, orf_accuracy);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Measure schedule — what gets tested at each grade/period
// ---------------------------------------------------------------------------
export const MEASURE_SCHEDULE = {
  K: {
    MOY: ["fsf", "lnf", "psf", "nwf_cls"],
    EOY: ["lnf", "psf", "nwf_cls"],
  },
  1: {
    BOY: ["lnf", "psf", "nwf_cls", "nwf_wwr"],
    MOY: ["nwf_cls", "nwf_wwr", "orf_words", "orf_accuracy"],
    EOY: ["nwf_cls", "nwf_wwr", "orf_words", "orf_accuracy", "retell"],
  },
  2: {
    BOY: ["nwf_cls", "nwf_wwr", "orf_words", "orf_accuracy", "retell"],
    MOY: ["orf_words", "orf_accuracy", "retell", "retell_quality"],
    EOY: ["orf_words", "orf_accuracy", "retell", "retell_quality"],
  },
  3: {
    BOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    MOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    EOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
  },
  4: {
    BOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    MOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    EOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
  },
  5: {
    BOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    MOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    EOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
  },
  6: {
    BOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    MOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
    EOY: ["orf_words", "orf_accuracy", "retell", "retell_quality", "maze"],
  },
};

/**
 * Get the list of measures applicable for a grade/period.
 * Always includes "composite" at the front.
 */
export function getMeasuresForGradePeriod(grade, period) {
  const schedule = MEASURE_SCHEDULE[grade]?.[period];
  if (!schedule) return null;
  return ["composite", ...schedule];
}
