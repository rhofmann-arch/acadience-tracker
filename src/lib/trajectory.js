/**
 * On-track growth trajectory reference line.
 *
 * This is Baymonte's school-wide oral reading fluency (ORF words-correct-
 * per-minute) goal, not an Acadience benchmark: students enter Grade 1 BOY
 * reading about 15 cwpm, and the school's goal is 100 cwpm by Grade 4 EOY,
 * anchored at whole-number end-of-year targets along the way:
 *
 *   Grade 1 EOY: 45 cwpm
 *   Grade 2 EOY: 65 cwpm
 *   Grade 3 EOY: 85 cwpm
 *   Grade 4 EOY: 100 cwpm
 *
 * Growth is front-loaded (30 cwpm in Grade 1, tapering to 15 by Grade 4),
 * matching how Grades 1-2 are "acquisition" years — still building phonics
 * knowledge through direct instruction — while Grades 3-4 are
 * "consolidating" years, applying decoding patterns already taught to
 * longer, more multisyllabic words.
 *
 * The line holds FLAT across each summer (EOY of one grade -> BOY of the
 * next) instead of continuing to climb — growth is only expected during
 * the school year. This turns each summer into a concrete, low-bar talking
 * point for families: "hold steady here and you're still on pace."
 *
 * It's a planning/communication tool, not a cutoff — a student below the
 * line isn't automatically "at risk" the way they would be relative to an
 * Acadience benchmark goal.
 */

export const ON_TRACK_START = { grade: "1", period: "BOY", cwpm: 15 };
export const ON_TRACK_END = { grade: "4", period: "EOY", cwpm: 100 };

// Whole-number end-of-year goals, set by the school (not evenly interpolated).
export const GRADE_EOY_GOAL = { 1: 45, 2: 65, 3: 85, 4: 100 };

const GRADES = ["1", "2", "3", "4"];

/**
 * The 12 BOY/MOY/EOY points from Grade 1 BOY through Grade 4 EOY. Each
 * grade's BOY equals the prior grade's EOY (flat over summer); MOY is the
 * rounded midpoint between that grade's BOY and EOY goals — every point is
 * a whole number.
 *
 * @returns {Array<{ grade: string, period: string, label: string, goalCwpm: number, isSummerStart: boolean }>}
 */
export function getOnTrackTrajectory() {
  const points = [];
  let boy = ON_TRACK_START.cwpm;

  GRADES.forEach((grade, gi) => {
    const eoy = GRADE_EOY_GOAL[grade];
    const moy = Math.round((boy + eoy) / 2);

    points.push({ grade, period: "BOY", label: `G${grade} BOY`, goalCwpm: boy, isSummerStart: gi > 0 });
    points.push({ grade, period: "MOY", label: `G${grade} MOY`, goalCwpm: moy, isSummerStart: false });
    points.push({ grade, period: "EOY", label: `G${grade} EOY`, goalCwpm: eoy, isSummerStart: false });

    boy = eoy; // next grade's BOY holds flat at this grade's EOY
  });

  return points;
}

// Computed once — the trajectory anchors and shape never change at runtime.
export const ON_TRACK_TRAJECTORY = getOnTrackTrajectory();

/**
 * Pull a student's actual ORF words-correct-per-minute score for each of the
 * given trajectory points (grade/period pairs) out of their score history.
 * Periods with no recorded score come back as null (not administered, or
 * the student hadn't reached that grade yet). Shared by the on-screen chart
 * and the PDF report so both plot the exact same values.
 */
export function getActualScores(points, history) {
  return points.map((p) => {
    const row = (history || []).find((h) => String(h.grade) === p.grade && h.period === p.period);
    const val = row?.orf_words;
    return val == null || val === "" ? null : Number(val);
  });
}
