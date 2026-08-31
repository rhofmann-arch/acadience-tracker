/**
 * Comprehension measure aggregation.
 *
 * Comprehension is measured a few different ways depending on grade and
 * tool — Retell Quality of Response, Maze, Capti ReadBasix Reading
 * Comprehension, and the Iowa Assessments Reading score — each on its own
 * scale. This module builds each measure's time series and combines their
 * current risk labels into one overall weighted indicator, shared by the
 * Comprehension Tracker (on-screen) and the Fluency Growth Report (PDF) so
 * both always agree.
 */

import {
  getBenchmarkStatus,
  benchmarkStatusToRiskLabel,
  getCaptiRiskLabel,
  getIowaRiskLabel,
  RISK_LABEL,
} from "./scoringEngine";

/**
 * Relative weight each comprehension measure carries in the overall
 * indicator, for Grade 4 and below. Iowa and Capti are the strongest
 * evidence — standardized, norm-referenced comprehension measures. Maze is
 * a real but coarser check. Retell Quality is the lightest signal: a
 * single rater's 1-4 judgment call on a retell, not a scored comprehension
 * task.
 */
export const COMPREHENSION_WEIGHTS = {
  iowa: 0.35,
  capti: 0.35,
  maze: 0.2,
  retell: 0.1,
};

/**
 * From Grade 5 on, Maze and Retell Quality are dropped from the overall
 * indicator entirely — Iowa and Capti are the school's primary
 * comprehension measures for older students, regardless of whether a
 * Maze/Retell score happens to be on file for that period.
 */
export const COMPREHENSION_WEIGHTS_UPPER = {
  iowa: 0.5,
  capti: 0.5,
};

const UPPER_GRADE_CUTOFF = 4; // grades > 4 use COMPREHENSION_WEIGHTS_UPPER

function toGradeNum(grade) {
  if (grade == null || grade === "") return null;
  if (grade === "K") return 0;
  const n = parseInt(grade, 10);
  return isNaN(n) ? null : n;
}

/**
 * The weight set to use for a given current grade — Grade 5+ drops Maze
 * and Retell Quality from the overall indicator (see
 * COMPREHENSION_WEIGHTS_UPPER above).
 */
export function getComprehensionWeights(gradeNum) {
  return gradeNum != null && gradeNum > UPPER_GRADE_CUTOFF ? COMPREHENSION_WEIGHTS_UPPER : COMPREHENSION_WEIGHTS;
}

/**
 * A student's current grade (as a number, K=0), taken as the highest grade
 * seen across their most recent Acadience, Capti, and Iowa records — so a
 * Grade 5+ student is recognized as such even from Capti/Iowa alone.
 */
export function getCurrentGradeNum(history, captiScores, iowaScores) {
  const candidates = [
    history?.[history.length - 1]?.grade,
    captiScores?.[captiScores.length - 1]?.grade,
    iowaScores?.[iowaScores.length - 1]?.grade_tested,
  ]
    .map(toGradeNum)
    .filter((n) => n != null);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

const RISK_SCORE = {
  [RISK_LABEL.ADVANCED.label]: 4,
  [RISK_LABEL.ON_TRACK.label]: 3,
  [RISK_LABEL.AT_SOME_RISK.label]: 2,
  [RISK_LABEL.AT_HIGH_RISK.label]: 1,
};

const SCORE_TO_RISK = {
  4: RISK_LABEL.ADVANCED,
  3: RISK_LABEL.ON_TRACK,
  2: RISK_LABEL.AT_SOME_RISK,
  1: RISK_LABEL.AT_HIGH_RISK,
};

/**
 * Combine each measure's current risk label into one overall comprehension
 * indicator, weighted by grade (see getComprehensionWeights). A measure
 * with no data — or one excluded for this grade — is simply left out and
 * the remaining weights renormalized, so e.g. a Grade 3 student with no
 * Capti yet (Capti starts Grade 5) still gets an overall from
 * Iowa/Maze/Retell alone, instead of never getting one.
 *
 * @param {{ iowa?: {label,color}|null, capti?, maze?, retell? }} risks
 * @param {number|null} [gradeNum] - current grade (K=0); Grade 5+ drops Maze/Retell
 * @returns {{ label: string, color: string, score: number } | null}
 */
export function getOverallComprehensionIndicator(risks, gradeNum) {
  const weights = getComprehensionWeights(gradeNum);
  const entries = Object.entries(weights)
    .map(([key, weight]) => [weight, risks[key]])
    .filter(([, risk]) => risk != null);

  if (entries.length === 0) return null;

  const totalWeight = entries.reduce((sum, [w]) => sum + w, 0);
  const weightedSum = entries.reduce((sum, [w, risk]) => sum + w * RISK_SCORE[risk.label], 0);
  const avg = weightedSum / totalWeight;
  const rounded = Math.min(4, Math.max(1, Math.round(avg)));

  return { ...SCORE_TO_RISK[rounded], score: avg };
}

/**
 * Build the full time series of {label, value, risk, grade, period} points
 * for each comprehension measure from a student's raw score history.
 *
 * @returns {{ retell: Array, maze: Array, capti: Array, iowa: Array }}
 */
export function getComprehensionPoints(history, captiScores, iowaScores) {
  const retell = (history || [])
    .filter((r) => r.retell_quality != null && r.retell_quality !== "")
    .map((r) => {
      const value = Number(r.retell_quality);
      return {
        label: `G${r.grade} ${r.period}`,
        value,
        grade: r.grade,
        period: r.period,
        risk: benchmarkStatusToRiskLabel(getBenchmarkStatus(r.grade, r.period, "retell_quality", value)),
      };
    })
    .filter((p) => !isNaN(p.value));

  const maze = (history || [])
    .filter((r) => r.maze != null && r.maze !== "")
    .map((r) => {
      const value = Number(r.maze);
      return {
        label: `G${r.grade} ${r.period}`,
        value,
        grade: r.grade,
        period: r.period,
        risk: benchmarkStatusToRiskLabel(getBenchmarkStatus(r.grade, r.period, "maze", value)),
      };
    })
    .filter((p) => !isNaN(p.value));

  const capti = (captiScores || [])
    .filter((r) => r.reading_comprehension != null && r.reading_comprehension !== "")
    .map((r) => {
      const value = Number(r.reading_comprehension);
      return {
        label: `G${r.grade} ${r.period}`,
        value,
        grade: r.grade,
        period: r.period,
        risk: getCaptiRiskLabel(value),
      };
    })
    .filter((p) => !isNaN(p.value));

  const iowa = (iowaScores || [])
    .filter((r) => r.reading_npr != null && r.reading_npr !== "")
    .map((r) => {
      const value = Number(r.reading_npr);
      const springYear = (r.school_year || "").split("-")[1]?.slice(-2);
      return {
        label: `G${r.grade_tested} '${springYear || "?"}`,
        value,
        grade: r.grade_tested,
        schoolYear: r.school_year,
        risk: getIowaRiskLabel(value),
      };
    })
    .filter((p) => !isNaN(p.value));

  return { retell, maze, capti, iowa };
}

/**
 * The most recent score (and its risk label) for each comprehension
 * measure, plus the overall weighted indicator across whichever measures
 * count for this student's grade. Used by the Comprehension Tracker's
 * summary card and the Fluency Growth Report PDF.
 *
 * @returns {{ retell, maze, capti, iowa: object|null, overall: object|null, gradeNum: number|null }}
 */
export function getComprehensionSummary(history, captiScores, iowaScores) {
  const points = getComprehensionPoints(history, captiScores, iowaScores);
  const latest = (arr) => (arr.length > 0 ? arr[arr.length - 1] : null);

  const retell = latest(points.retell);
  const maze = latest(points.maze);
  const capti = latest(points.capti);
  const iowa = latest(points.iowa);
  const gradeNum = getCurrentGradeNum(history, captiScores, iowaScores);

  const overall = getOverallComprehensionIndicator(
    { iowa: iowa?.risk, capti: capti?.risk, maze: maze?.risk, retell: retell?.risk },
    gradeNum
  );

  return { retell, maze, capti, iowa, overall, gradeNum };
}
