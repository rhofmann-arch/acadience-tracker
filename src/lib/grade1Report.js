/**
 * Grade 1 Reading Risk Report — logic shared by the individual PDF report
 * and the Grade 1 Teacher Dashboard.
 *
 * Grade 1 (and eventually Kindergarten EOY) doesn't have Oral Reading
 * Fluency or comprehension measures the way Grades 2+ do, so the general
 * Fluency Growth Report / Teacher Dashboard don't fit. This module builds
 * a report centered on the Acadience Composite Score instead: an overall
 * risk indicator, a subtest-by-subtest breakdown with plain-language notes
 * on how each one predicts later reading success, and an intervention +
 * progress-monitoring recommendation that factors in both the national
 * benchmark and how the student compares to their own grade this year.
 */

import { getBenchmarkStatus, getThresholds, STATUS, RISK_LABEL, benchmarkStatusToRiskLabel } from "./scoringEngine";
import { MEASURE_SCHEDULE } from "./scoringEngine";

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
    note: "Measures how quickly a student names upper- and lowercase letters. LNF has no benchmark goal of its own — it isn't something to directly teach — but Acadience's research shows it's a reliable early predictor of reading risk, so it's included as a flag rather than a skill target.",
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

// ---------------------------------------------------------------------------
// Intervention recommendation
// ---------------------------------------------------------------------------

export const INTERVENTION_LEVEL = {
  STRONG: { level: "Strong", days: 4, risk: RISK_LABEL.AT_HIGH_RISK },
  MODERATE: { level: "Moderate", days: 2, risk: RISK_LABEL.AT_SOME_RISK },
  MONITOR: { level: "Monitor", days: 0, risk: RISK_LABEL.ON_TRACK },
  NONE: { level: "None", days: 0, risk: RISK_LABEL.ADVANCED },
};

const LOCAL_PERCENTILE_OVERRIDE_CUTOFF = 10;

const STATUS_SEVERITY = {
  [STATUS.WELL_BELOW.status]: 0,
  [STATUS.BELOW.status]: 1,
  [STATUS.AT.status]: 2,
  [STATUS.ABOVE.status]: 3,
};

/** The more severe (lower-likelihood) of two benchmark statuses; null-safe. */
function moreSevereStatus(a, b) {
  if (!a) return b;
  if (!b) return a;
  return STATUS_SEVERITY[a.status] <= STATUS_SEVERITY[b.status] ? a : b;
}

/**
 * Intervention intensity from the composite's national benchmark status,
 * with one override: a student At Benchmark nationally but in the bottom
 * 10% of their own grade locally still gets bumped to Moderate, since a
 * whole local cohort can run above or below the national norm.
 *
 * @param {{status:string}|null} compositeStatus - from getBenchmarkStatus
 * @param {number|null} localPercentile - from getLocalPercentile
 */
export function getInterventionRecommendation(compositeStatus, localPercentile) {
  let rec;
  if (compositeStatus?.status === STATUS.WELL_BELOW.status) rec = INTERVENTION_LEVEL.STRONG;
  else if (compositeStatus?.status === STATUS.BELOW.status) rec = INTERVENTION_LEVEL.MODERATE;
  else if (compositeStatus?.status === STATUS.ABOVE.status) rec = INTERVENTION_LEVEL.NONE;
  else if (compositeStatus?.status === STATUS.AT.status) rec = INTERVENTION_LEVEL.MONITOR;
  else return { ...INTERVENTION_LEVEL.MONITOR, overridden: false, reason: "no-composite" };

  let overridden = false;
  if (
    compositeStatus?.status === STATUS.AT.status &&
    localPercentile != null &&
    localPercentile <= LOCAL_PERCENTILE_OVERRIDE_CUTOFF
  ) {
    rec = INTERVENTION_LEVEL.MODERATE;
    overridden = true;
  }

  return { ...rec, overridden };
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
// Progress monitoring plan
// ---------------------------------------------------------------------------

const PM_CADENCE = { Strong: "weekly", Moderate: "every 2 weeks", Monitor: "at the next benchmark", None: "at the next benchmark" };

/**
 * Which measure(s) to progress-monitor and how often, based on the
 * intervention level and which of this period's subtests are themselves
 * Below or Well Below benchmark (the actual deficit areas to track).
 */
export function getProgressMonitoringPlan(level, belowMeasureNames) {
  const cadence = PM_CADENCE[level] || "at the next benchmark";
  if (level === "Monitor" || level === "None" || belowMeasureNames.length === 0) {
    return { cadence, measures: [], text: `Continue benchmark-only monitoring (BOY/MOY/EOY); no additional progress monitoring needed ${cadence}.` };
  }
  const list = belowMeasureNames.join(" and ");
  return {
    cadence,
    measures: belowMeasureNames,
    text: `Progress monitor ${list} ${cadence} using Acadience Progress Monitoring materials.`,
  };
}

/** One paragraph tying the composite status, ORF (if it's the driving
 * signal), local percentile, and any override together — the "why" behind
 * the recommendation. */
export function getRecommendationReasoning(assessment) {
  const { compositeStatus, effectiveStatus, orfDriven, localPercentile, recommendation } = assessment;
  const statusForLikelihood = effectiveStatus || compositeStatus;
  if (!statusForLikelihood) {
    return "No composite or ORF score is available this period, so an intervention level can't be determined yet.";
  }
  const pctText =
    localPercentile != null
      ? ` and ranks in the ${ordinal(localPercentile)} percentile among this year's Grade 1 students at Baymonte`
      : "";

  if (orfDriven) {
    const compositeText = compositeStatus ? compositeStatus.status : "not yet available this period";
    return (
      `The composite score is ${compositeText}, but this period's Oral Reading Fluency score ` +
      `(DIBELS 8 Grade 1 BOY benchmark) is ${effectiveStatus.status} — the more urgent of the two signals${pctText}. ` +
      `Recommending based on the ORF result.`
    );
  }

  const likelihood = getLikelihoodText(statusForLikelihood);
  if (recommendation.overridden) {
    return (
      `The composite score is At Benchmark nationally (${likelihood})${pctText} — among the lowest in this ` +
      `year's local cohort. Recommending Moderate intervention as a precaution, since a whole grade can run ` +
      `above or below the national norm.`
    );
  }
  return `The composite score is ${statusForLikelihood.status} (${likelihood})${pctText}.`;
}

/**
 * Build everything the Grade 1 report needs for one student: composite
 * status, per-subtest breakdown, local percentile, intervention level, and
 * a progress-monitoring plan.
 */
export function buildGrade1Assessment(grade, period, scoreRow, localCompositeValues) {
  const measures = MEASURE_SCHEDULE[grade]?.[period] || [];
  const composite = scoreRow?.composite;
  const compositeStatus = composite != null ? getBenchmarkStatus(grade, period, "composite", composite) : null;
  const localPercentile = composite != null ? getLocalPercentile(localCompositeValues, composite) : null;

  // Grade 1 BOY ORF is benchmarked against DIBELS 8 (Acadience doesn't
  // score ORF until MOY) — flag it so the report can say so.
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

  const belowMeasureNames = subtests
    .filter((s) => s.status?.status === STATUS.BELOW.status || s.status?.status === STATUS.WELL_BELOW.status)
    .map((s) => s.name.replace(/\s*\([A-Z-]+\)$/, "")); // drop the "(NWF-CLS)"-style suffix for prose

  // Grade 1 BOY only: the recommendation uses whichever is more severe of
  // the composite and this period's DIBELS 8 ORF benchmark — a student
  // fine on the composite but Below/Well Below on ORF still gets flagged.
  const orfWordsStatus = subtests.find((s) => s.measure === "orf_words")?.status || null;
  const usesOrfSignal = grade === "1" && period === "BOY" && orfWordsStatus != null;
  const effectiveStatus = usesOrfSignal ? moreSevereStatus(compositeStatus, orfWordsStatus) : compositeStatus;
  const orfDriven =
    usesOrfSignal &&
    effectiveStatus === orfWordsStatus &&
    (!compositeStatus || STATUS_SEVERITY[orfWordsStatus.status] < STATUS_SEVERITY[compositeStatus.status]);

  const recommendation = getInterventionRecommendation(effectiveStatus, localPercentile);
  const pmPlan = getProgressMonitoringPlan(recommendation.level, belowMeasureNames);

  return {
    composite,
    compositeStatus,
    compositeRisk: benchmarkStatusToRiskLabel(compositeStatus),
    orfWordsStatus,
    effectiveStatus,
    orfDriven,
    localPercentile,
    subtests,
    recommendation,
    pmPlan,
  };
}
