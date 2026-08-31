/**
 * On-track growth trajectory reference line.
 *
 * This is Baymonte's school-wide oral reading fluency (ORF words-correct-
 * per-minute) goal, not an Acadience benchmark: students enter Grade 1 BOY
 * reading about 15 cwpm, and the school's goal is 100 cwpm by Grade 4 EOY.
 *
 *   - Grades 1-2 are "acquisition" years — students are still building
 *     phonics knowledge through direct instruction.
 *   - Grades 3-4 are "consolidating" years — the decoding patterns have all
 *     been taught, and students are applying them to longer, more
 *     multisyllabic words.
 *
 * The trajectory is a straight-line interpolation between the two anchor
 * points (Grade 1 BOY -> Grade 4 EOY) across the 12 BOY/MOY/EOY benchmark
 * periods in between. It's a planning/communication tool, not a cutoff —
 * a student below the line isn't automatically "at risk" the way they would
 * be relative to an Acadience benchmark goal.
 */

export const ON_TRACK_START = { grade: "1", period: "BOY", cwpm: 15 };
export const ON_TRACK_END = { grade: "4", period: "EOY", cwpm: 100 };

const GRADES = ["1", "2", "3", "4"];
const PERIODS = ["BOY", "MOY", "EOY"];

/**
 * The 12 BOY/MOY/EOY points from Grade 1 BOY through Grade 4 EOY, with the
 * on-track cwpm goal linearly interpolated from ON_TRACK_START to ON_TRACK_END.
 *
 * @returns {Array<{ grade: string, period: string, label: string, goalCwpm: number }>}
 */
export function getOnTrackTrajectory() {
  const points = [];
  for (const grade of GRADES) {
    for (const period of PERIODS) {
      points.push({ grade, period });
    }
  }
  const steps = points.length - 1; // 11 intervals across 12 points
  const span = ON_TRACK_END.cwpm - ON_TRACK_START.cwpm;
  return points.map((p, i) => ({
    ...p,
    label: `G${p.grade} ${p.period}`,
    goalCwpm: ON_TRACK_START.cwpm + (span * i) / steps,
  }));
}

// Computed once — the trajectory anchors and shape never change at runtime.
export const ON_TRACK_TRAJECTORY = getOnTrackTrajectory();
