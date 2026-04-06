import { useState, useMemo } from "react";
import {
  getSchoolYears,
  getPeriodsForYear,
  getSchoolWideScores,
} from "../lib/dataService";
import { getBenchmarkStatus, mclassLevelToStatus, STATUS } from "../lib/scoringEngine";

const GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6"];
const GRADE_LABELS = { K: "Kindergarten", 1: "Grade 1", 2: "Grade 2", 3: "Grade 3", 4: "Grade 4", 5: "Grade 5", 6: "Grade 6" };

function StatusBar({ scores, grade, period }) {
  const counts = { above: 0, at: 0, below: 0, wellBelow: 0 };

  for (const s of scores) {
    let result;
    // For mClass data, always use mClass-provided level for consistency
    if (s.data_source === "mClass" && s.mclass_composite_level) {
      result = mclassLevelToStatus(s.mclass_composite_level);
    } else {
      result = getBenchmarkStatus(grade, period, "composite", s.composite);
      if (!result && s.mclass_composite_level) {
        result = mclassLevelToStatus(s.mclass_composite_level);
      }
    }
    if (!result) continue;
    if (result.status === STATUS.ABOVE.status) counts.above++;
    else if (result.status === STATUS.AT.status) counts.at++;
    else if (result.status === STATUS.BELOW.status) counts.below++;
    else if (result.status === STATUS.WELL_BELOW.status) counts.wellBelow++;
  }

  const total = counts.above + counts.at + counts.below + counts.wellBelow;
  if (total === 0) return <p className="no-data">No composite scores</p>;

  const pct = (n) => Math.round((n / total) * 100);
  const atOrAbove = pct(counts.above + counts.at);

  return (
    <div>
      <div className="stacked-bar">
        {counts.above > 0 && (
          <div className="seg" style={{ flex: counts.above, background: "#1D9E75" }}>
            {pct(counts.above) > 8 ? pct(counts.above) + "%" : ""}
          </div>
        )}
        {counts.at > 0 && (
          <div className="seg" style={{ flex: counts.at, background: "#4db892" }}>
            {pct(counts.at) > 8 ? pct(counts.at) + "%" : ""}
          </div>
        )}
        {counts.below > 0 && (
          <div className="seg" style={{ flex: counts.below, background: "#EF9F27" }}>
            {pct(counts.below) > 8 ? pct(counts.below) + "%" : ""}
          </div>
        )}
        {counts.wellBelow > 0 && (
          <div className="seg" style={{ flex: counts.wellBelow, background: "#D85A30" }}>
            {pct(counts.wellBelow) > 8 ? pct(counts.wellBelow) + "%" : ""}
          </div>
        )}
      </div>
      <div className="bar-legend">
        <span><span className="dot" style={{ background: "#1D9E75" }} /> Above: {counts.above}</span>
        <span><span className="dot" style={{ background: "#4db892" }} /> At: {counts.at}</span>
        <span><span className="dot" style={{ background: "#EF9F27" }} /> Below: {counts.below}</span>
        <span><span className="dot" style={{ background: "#D85A30" }} /> Well Below: {counts.wellBelow}</span>
        <span style={{ marginLeft: "auto", fontWeight: 600 }}>
          {atOrAbove}% at or above benchmark ({total} students)
        </span>
      </div>
    </div>
  );
}

export default function SchoolSummary() {
  const years = getSchoolYears();
  const [year, setYear] = useState(years[0] || "");
  const periods = getPeriodsForYear(year);
  const [period, setPeriod] = useState("");

  useMemo(() => {
    if (periods.length && !periods.includes(period)) {
      setPeriod(periods[periods.length - 1]);
    }
  }, [year, periods]);

  const gradeData = getSchoolWideScores(year, period);
  const grades = GRADE_ORDER.filter((g) => gradeData[g]?.length > 0);

  return (
    <div>
      <div className="filters">
        <label>Year:</label>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>

        <label>Period:</label>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      {grades.length === 0 ? (
        <div className="no-data">No data for this selection.</div>
      ) : (
        grades.map((grade) => (
          <div key={grade} className="grade-summary-card">
            <h3>{GRADE_LABELS[grade] || `Grade ${grade}`}</h3>
            <StatusBar
              scores={gradeData[grade]}
              grade={grade}
              period={period}
            />
          </div>
        ))
      )}
    </div>
  );
}
