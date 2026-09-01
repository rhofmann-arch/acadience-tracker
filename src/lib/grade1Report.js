/**
 * Grade 1 Reading Risk Report — logic shared by the individual PDF report
 * and the Grade 1 Teacher Dashboard.
 *
 * Grade 1 (and eventually Kindergarten EOY) doesn't have Oral Reading
 * Fluency or comprehension measures the way Grades 2+ do, so the general
 * Fluency Growth Report / Teacher Dashboard don't fit. This module builds
 * a report centered on the Acadience Composite Score and subtests instead.
 *
 * The recommendation is driven by three independent flags rather than the
 * composite alone, since a single additive number can hide a mixed subtest
 * profile (see checkCompositeMismatch) and can be pulled around by Letter
 * Naming Fluency, which — despite being a real predictor (~r=.50, roughly
 * 25% of variance in later reading) — Acadience itself doesn't benchmark
 * and doesn't consider a powerful instructional target. LNF is shown on
 * every report for context but never counts toward any flag below.
 *
 *   A. Low across the board — composite Well Below AND >=2 other
 *      benchmarked subtests Below/Well Below. -> Strong (4x/week).
 *   B. Significantly low in one remediable area — a single non-LNF
 *      subtest Well Below on its own, composite notwithstanding. Two
 *      stages: Retest Needed (no follow-up data yet) -> Confirmed (a
 *      later benchmark or progress-monitoring score for that same
 *      measure is also Well Below), which carries a skill-specific
 *      intervention suggestion instead of the generic 4x/week.
 *   C. Borderline — composite or any subtest in the bottom 25% of this
 *      year's Grade 1 cohort, regardless of national benchmark status.
 *      -> Watch: monthly progress monitoring, escalating to intervention
 *      if a later benchmark comes back Well Below, or two consecutive PM
 *      scores land below that period's benchmark.
 *
 * Priority when multiple flags apply: A > confirmed B > pending B > C.
 */

import {
  getBenchmarkStatus,
  getThresholds,
  calculateComposite,
  STATUS,
  RISK_LABEL,
  benchmarkStatusToRiskLabel,
  MEASURE_SCHEDULE,
} from "./scoringEngine";

// ---------------------------------------------------------------------------
// What each measure means and why it predicts later reading success
// ---------------------------------------------------------------------------
export const MEASURE_CORRELATION = {
  composite: {
    name: "Composite Score",
    note: "Combines every measure given this period into one estimate of overall reading proficiency — Acadience's best single predictor of a student's future reading trajectory.",
  },
  lnf: {
    name: "Letter Naming Fluency (LNF)",
    note: "Measures how quickly a student names upper- and lowercase letters. Real but modest predictor of later reading (correlation ~0.5, so it accounts for roughly a quarter of the variation in outcomes) — and Acadience is explicit that it isn't a powerful instructional target. It has no benchmark goal and never drives a recommendation on this report by itself; it's shown for context only.",
  },
  psf: {
    name: "Phoneme Segmentation Fluency (PSF)",
    note: "Measures a student's ability to break spoken words into individual sounds. Phonemic awareness at this level is one of the strongest known predictors of later decoding and spelling success — students who struggle to segment sounds typically struggle to map those sounds to letters.",
  },
  nwf_cls: {
    name: "Nonsense Word Fluency — Correct Letter Sounds (NWF-CLS)",
    note: "Measures how well a student applies letter-sound correspondences to sound out unfamiliar words — the alphabetic principle. It isolates true decoding skill from memorized sight words and strongly predicts Grade 1-2 reading outcomes.",
  },
  nwf_wwr: {
    name: "Nonsense Word Fluency — Whole Words Read (NWF-WWR)",
    note: "Shows whether a student is blending sounds into whole words rather than sounding out letter-by-letter — an early sign of decoding automaticity, a step toward fluent reading.",
  },
  orf_words: {
    name: "Oral Reading Fluency — Words Correct",
    note: "Words read correctly per minute on grade-level text. It's the measure most predictive of later reading comprehension, since fluent, accurate decoding frees up attention for understanding meaning.",
  },
  orf_accuracy: {
    name: "Oral Reading Fluency — Accuracy",
    note: "The percent of words read correctly. Low accuracy alongside decent speed can signal guessing rather than true decoding, and predicts future comprehension difficulty if it isn't addressed.",
  },
  retell: {
    name: "Retell",
    note: "The number of relevant details a student recalls after reading. It's a coarse early check on comprehension — correlated with, though less precise than, the comprehension measures used from Grade 2 on.",
  },
};

// ---------------------------------------------------------------------------
// Local percentile
// ---------------------------------------------------------------------------

/**
 * Percentile rank of `value` among `values` (all numbers, e.g. every Grade
 * 1 student's composite score this period), using the midpoint method —
 * ties split the difference so nobody's percentile depends on array order.
 * Returns null if there's nothing to compare against.
 */
export function getLocalPercentile(values, value) {
  const nums = (values || []).filter((v) => v != null && !isNaN(v));
  if (nums.length === 0 || value == null || isNaN(value)) return null;
  let below = 0;
  let equal = 0;
  for (const v of nums) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return Math.round(((below + 0.5 * equal) / nums.length) * 100);
}

/** { composite: [values...], psf: [values...], ... } across a grade cohort —
 * the peer group for local-percentile comparisons, one array per measure. */
export function getLocalValuesByMeasure(gradeRows, measures) {
  const out = {};
  for (const m of ["composite", ...measures]) {
    out[m] = (gradeRows || []).map((r) => r.score?.[m]).filter((v) => v != null && !isNaN(v));
  }
  return out;
}

/** "43rd", "22nd", "3rd", "14th" — the 11-13 exception, then last digit. */
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Acadience's documented likelihood-of-future-success band for a benchmark status. */
export function getLikelihoodText(status) {
  if (status?.status === STATUS.ABOVE.status) return "roughly 90-99% likelihood of reaching future reading goals";
  if (status?.status === STATUS.AT.status) return "roughly 80-90% likelihood of reaching future reading goals";
  if (status?.status === STATUS.BELOW.status) return "outcomes that are harder to predict without additional support";
  if (status?.status === STATUS.WELL_BELOW.status) return "roughly 10-20% likelihood of reaching future reading goals without additional support";
  return "no likelihood band available";
}

// ---------------------------------------------------------------------------
// Composite sanity check
// ---------------------------------------------------------------------------

/**
 * Compare the stored composite against what this app's own formula would
 * calculate from the same subtests. A mismatch beyond a couple points is
 * surfaced as a data-quality note — never silently corrected, since we
 * don't know which value is authoritative (a different but valid official
 * methodology vs. a transcription error).
 */
export function checkCompositeMismatch(grade, period, scoreRow) {
  if (!scoreRow || scoreRow.composite == null) return null;
  const expected = calculateComposite(grade, period, scoreRow);
  if (expected == null) return null;
  const stored = Number(scoreRow.composite);
  if (isNaN(stored)) return null;
  const diff = Math.round((expected - stored) * 10) / 10;
  if (Math.abs(diff) <= 2) return null;
  return { stored, expected, diff };
}

// ---------------------------------------------------------------------------
// Skill-specific intervention suggestions (Flag B, once confirmed)
// ---------------------------------------------------------------------------

export const SPECIFIC_INTERVENTIONS = {
  psf: "Targeted Orton-Gillingham phonemic awareness work — segmenting and blending sounds — rather than a full core replacement.",
  nwf_cls: "Targeted Orton-Gillingham letter-sound automaticity drills (alphabetic principle).",
  nwf_wwr: "Targeted Orton-Gillingham blending practice — decoding whole words from sounded-out parts.",
  orf_words: "Targeted Orton-Gillingham fluency building — repeated reading of decodable text at the student's level.",
  orf_accuracy: "Targeted Orton-Gillingham decoding-accuracy review — low accuracy with reasonable speed usually means guessing, not sounding out; revisit the phonics patterns being missed.",
  retell: "Targeted comprehension-strategy support — retelling structure and main-idea identification.",
};

const RETEST_WINDOW = "within 2-3 weeks";

// ---------------------------------------------------------------------------
// Flag A — low across the board
// ---------------------------------------------------------------------------

function checkLowAcrossBoard(compositeStatus, nonLnfSubtests) {
  if (compositeStatus?.status !== STATUS.WELL_BELOW.status) return null;
  const belowOrWorse = nonLnfSubtests.filter(
    (s) => s.status?.status === STATUS.BELOW.status || s.status?.status === STATUS.WELL_BELOW.status
  );
  if (belowOrWorse.length < 2) return null;
  return { measures: belowOrWorse.map((s) => s.measure) };
}

// ---------------------------------------------------------------------------
// Flag B — significantly low in one remediable area, retest -> confirm
// ---------------------------------------------------------------------------

/**
 * Look for a later data point on the same measure — the next benchmark
 * period in this student's history, or a progress-monitoring score dated
 * after this one — to decide whether a Well Below subtest is confirmed
 * (still low), resolved (came back fine), or still pending (no follow-up
 * data yet).
 */
function followUpForMeasure(measure, grade, period, scoreRow, history, pmScores) {
  const thisDate = scoreRow?.assessment_date || "";
  const ref = getThresholds(grade, period, measure);

  // Next official benchmark period for this measure, if this report is
  // being generated retrospectively (e.g. viewing BOY after MOY happened).
  const idx = (history || []).findIndex(
    (h) => h.school_year === scoreRow?.school_year && h.period === period && String(h.grade) === String(grade)
  );
  if (idx !== -1) {
    for (let i = idx + 1; i < history.length; i++) {
      const row = history[i];
      if (row[measure] == null) continue;
      const status = getBenchmarkStatus(row.grade, row.period, measure, row[measure]);
      if (!status) continue;
      return {
        state: status.status === STATUS.WELL_BELOW.status ? "confirmed" : "resolved",
        source: "benchmark",
        label: `${row.period} benchmark`,
        value: row[measure],
      };
    }
  }

  // Otherwise, the most recent progress-monitoring score for this measure.
  const laterPMs = (pmScores || [])
    .filter((pm) => pm[measure] != null && (!thisDate || (pm.assessment_date || "") > thisDate))
    .sort((a, b) => (a.assessment_date || "").localeCompare(b.assessment_date || ""));
  if (laterPMs.length > 0 && ref?.at != null) {
    const latest = laterPMs[laterPMs.length - 1];
    const stillBelow = Number(latest[measure]) < ref.at;
    return {
      state: stillBelow ? "confirmed" : "resolved",
      source: "progress monitoring",
      label: `PM on ${latest.assessment_date}`,
      value: latest[measure],
    };
  }

  return { state: "pending" };
}

function checkSingleAreaDeficits(nonLnfSubtests, grade, period, scoreRow, history, pmScores) {
  return nonLnfSubtests
    .filter((s) => s.status?.status === STATUS.WELL_BELOW.status)
    .map((s) => ({
      measure: s.measure,
      name: s.name,
      followUp: followUpForMeasure(s.measure, grade, period, scoreRow, history, pmScores),
    }))
    .filter((d) => d.followUp.state !== "resolved"); // dropped once a later score comes back fine
}

// ---------------------------------------------------------------------------
// Flag C — borderline (bottom 25% locally)
// ---------------------------------------------------------------------------

const BORDERLINE_PERCENTILE_CUTOFF = 25;

function checkBorderline(compositeValue, compositePercentile, nonLnfSubtests, localValuesByMeasure) {
  const flagged = [];
  if (compositePercentile != null && compositePercentile <= BORDERLINE_PERCENTILE_CUTOFF) {
    flagged.push({ measure: "composite", name: "Composite Score", percentile: compositePercentile });
  }
  for (const s of nonLnfSubtests) {
    if (s.value == null) continue;
    const pct = getLocalPercentile(localValuesByMeasure?.[s.measure], s.value);
    if (pct != null && pct <= BORDERLINE_PERCENTILE_CUTOFF) {
      flagged.push({ measure: s.measure, name: s.name, percentile: pct });
    }
  }
  return flagged;
}

/** Has this borderline case already earned escalation from Watch to a real
 * intervention — a later benchmark Well Below, or two consecutive PM scores
 * below that period's own benchmark? */
function checkWatchEscalation(borderlineMeasures, grade, period, scoreRow, history, pmScores) {
  for (const b of borderlineMeasures) {
    if (b.measure === "composite") continue; // escalation is judged per skill, not the composite itself
    const followUp = followUpForMeasure(b.measure, grade, period, scoreRow, history, pmScores);
    if (followUp.state === "confirmed" && followUp.source === "benchmark") {
      return { measure: b.measure, reason: `a later benchmark came back Well Below Benchmark (${followUp.label})` };
    }
    const relevant = (pmScores || [])
      .filter((pm) => pm[b.measure] != null)
      .sort((a, c) => (a.assessment_date || "").localeCompare(c.assessment_date || ""));
    const ref = getThresholds(grade, period, b.measure);
    if (relevant.length >= 2 && ref?.at != null) {
      const lastTwo = relevant.slice(-2);
      const bothBelow = lastTwo.every((pm) => Number(pm[b.measure]) < ref.at);
      if (bothBelow) {
        return { measure: b.measure, reason: "the last two progress-monitoring scores both came back below benchmark" };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recommendation tiers
// ---------------------------------------------------------------------------

export const TIER = {
  STRONG: { tier: "Strong", label: "Strong", days: 4, risk: RISK_LABEL.AT_HIGH_RISK },
  CONFIRMED: { tier: "Confirmed", label: "Confirmed", days: 2, risk: RISK_LABEL.AT_SOME_RISK },
  RETEST: { tier: "RetestNeeded", label: "Retest Needed", days: 0, risk: RISK_LABEL.AT_SOME_RISK },
  WATCH: { tier: "Watch", label: "Watch", days: 0, risk: RISK_LABEL.ON_TRACK },
  NONE: { tier: "None", label: "None", days: 0, risk: RISK_LABEL.ADVANCED },
};

function measureName(measure) {
  return MEASURE_CORRELATION[measure]?.name.replace(/\s*\([A-Z-]+\)$/, "") || measure;
}

/**
 * Build everything the Grade 1 report needs for one student: composite
 * status (with a mismatch check), per-subtest breakdown, local percentiles,
 * the three flags, the resulting recommendation tier, and a progress-
 * monitoring plan.
 *
 * @param {object} args
 * @param {string} args.grade
 * @param {string} args.period
 * @param {object|null} args.scoreRow - this student's score row for the period
 * @param {Array<object>} [args.history] - this student's full Acadience history (for later-period follow-up checks)
 * @param {Array<object>} [args.pmScores] - this student's progress-monitoring records
 * @param {{composite: number[], [measure: string]: number[]}} [args.localValuesByMeasure] - this year/period's whole-grade values, per measure
 */
export function buildGrade1Assessment({ grade, period, scoreRow, history = [], pmScores = [], localValuesByMeasure = {} }) {
  const measures = MEASURE_SCHEDULE[grade]?.[period] || [];
  const composite = scoreRow?.composite;
  const compositeStatus = composite != null ? getBenchmarkStatus(grade, period, "composite", composite) : null;
  const localPercentile = composite != null ? getLocalPercentile(localValuesByMeasure.composite, composite) : null;
  const compositeMismatch = checkCompositeMismatch(grade, period, scoreRow);

  const isBoyOrfDibels8 = grade === "1" && period === "BOY";
  const subtests = measures.map((m) => {
    const value = scoreRow?.[m];
    const status = value != null ? getBenchmarkStatus(grade, period, m, value) : null;
    const ref = getThresholds(grade, period, m);
    const correlation = MEASURE_CORRELATION[m];
    const note =
      isBoyOrfDibels8 && (m === "orf_words" || m === "orf_accuracy")
        ? `${correlation.note} Benchmarked against DIBELS 8th Edition, since Acadience doesn't score ORF until Grade 1 MOY.`
        : correlation.note;
    return {
      measure: m,
      ...correlation,
      note,
      value,
      status,
      risk: benchmarkStatusToRiskLabel(status),
      hasBenchmark: !!ref,
    };
  });

  const nonLnfSubtests = subtests.filter((s) => s.measure !== "lnf" && s.hasBenchmark);

  const flagA = checkLowAcrossBoard(compositeStatus, nonLnfSubtests);
  const flagB = checkSingleAreaDeficits(nonLnfSubtests, grade, period, scoreRow, history, pmScores);
  const flagBConfirmed = flagB.filter((d) => d.followUp.state === "confirmed");
  const flagBPending = flagB.filter((d) => d.followUp.state === "pending");
  const flagC = checkBorderline(composite, localPercentile, nonLnfSubtests, localValuesByMeasure);
  const watchEscalation = flagC.length > 0 ? checkWatchEscalation(flagC, grade, period, scoreRow, history, pmScores) : null;

  // Priority: A > confirmed B > pending B > escalated watch > watch > none.
  let recommendation;
  if (flagA) {
    recommendation = {
      ...TIER.STRONG,
      reasoning:
        `Composite is Well Below Benchmark and ${flagA.measures.length} other subtests ` +
        `(${flagA.measures.map(measureName).join(", ")}) are also Below or Well Below — a low profile across the board, not one isolated score.`,
      pmPlan: { cadence: "weekly", text: `Progress monitor ${flagA.measures.map(measureName).join(" and ")} weekly using Acadience Progress Monitoring materials.` },
    };
  } else if (flagBConfirmed.length > 0) {
    const d = flagBConfirmed[0];
    recommendation = {
      ...TIER.CONFIRMED,
      label: `Confirmed — ${measureName(d.measure)}`,
      reasoning:
        `${measureName(d.measure)} was Well Below Benchmark and a follow-up (${d.followUp.label}) confirmed it's still low. ` +
        `${SPECIFIC_INTERVENTIONS[d.measure] || "Targeted skill-specific intervention recommended."}`,
      pmPlan: { cadence: "every 2 weeks", text: `Progress monitor ${measureName(d.measure)} every 2 weeks using Acadience Progress Monitoring materials.` },
    };
  } else if (flagBPending.length > 0) {
    const d = flagBPending[0];
    recommendation = {
      ...TIER.RETEST,
      label: `Retest Needed — ${measureName(d.measure)}`,
      days: 0,
      reasoning:
        `${measureName(d.measure)} is Well Below Benchmark on its own, even though the rest of the profile may look fine. ` +
        `Before starting intervention, recommend a retest or follow-up assessment of ${measureName(d.measure)} ${RETEST_WINDOW} to confirm — a single low score can be a testing-day fluke.`,
      pmPlan: { cadence: "in 2-3 weeks", text: `Retest or progress-monitor ${measureName(d.measure)} ${RETEST_WINDOW} to confirm before deciding on intervention.` },
    };
  } else if (watchEscalation) {
    recommendation = {
      ...TIER.CONFIRMED,
      label: `Confirmed — ${measureName(watchEscalation.measure)}`,
      reasoning:
        `${measureName(watchEscalation.measure)} was borderline (bottom ${BORDERLINE_PERCENTILE_CUTOFF}% locally) and has since escalated: ${watchEscalation.reason}. ` +
        `${SPECIFIC_INTERVENTIONS[watchEscalation.measure] || "Targeted skill-specific intervention recommended."}`,
      pmPlan: { cadence: "every 2 weeks", text: `Progress monitor ${measureName(watchEscalation.measure)} every 2 weeks using Acadience Progress Monitoring materials.` },
    };
  } else if (flagC.length > 0) {
    const names = flagC.map((f) => (f.measure === "composite" ? "the composite" : measureName(f.measure)));
    recommendation = {
      ...TIER.WATCH,
      reasoning:
        `${names.join(" and ")} rank${names.length === 1 ? "s" : ""} in the bottom ${BORDERLINE_PERCENTILE_CUTOFF}% of this year's Grade 1 cohort at Baymonte, even without a Well Below national benchmark. ` +
        `Early intervention pays off disproportionately in Grade 1, so this is worth a short watch window rather than waiting a full period to see if it resolves on its own.`,
      pmPlan: {
        cadence: "monthly",
        text:
          `Progress monitor ${names.join(" and ")} monthly. Move to intervention if a later benchmark comes back Well Below Benchmark, ` +
          `or if two consecutive monthly progress-monitoring scores land below that period's benchmark — don't let a borderline case ride for a full period.`,
      },
    };
  } else {
    recommendation = {
      ...TIER.NONE,
      reasoning: compositeStatus
        ? `Composite is ${compositeStatus.status} (${getLikelihoodText(compositeStatus)}), and no subtest is a standout concern.`
        : "No composite score is available this period, and no subtest is a standout concern.",
      pmPlan: { cadence: "at the next benchmark", text: "Continue benchmark-only monitoring (BOY/MOY/EOY); no additional progress monitoring needed." },
    };
  }

  return {
    composite,
    compositeStatus,
    compositeRisk: benchmarkStatusToRiskLabel(compositeStatus),
    compositeMismatch,
    localPercentile,
    subtests,
    flags: { lowAcrossBoard: flagA, singleAreaDeficits: flagB, borderline: flagC, watchEscalation },
    recommendation,
  };
}
