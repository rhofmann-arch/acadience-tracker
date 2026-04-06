import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getSchoolYears,
  getPeriodsForYear,
  getClassesForYear,
  getClassScores,
  getClassGrowthData,
} from "../lib/dataService";
import { generateClassroomReport, generateGrowthReport } from "../lib/pdfReports";
import {
  getBenchmarkStatus,
  getMeasuresForGradePeriod,
  mclassLevelToStatus,
  STATUS,
} from "../lib/scoringEngine";

const MEASURE_LABELS = {
  composite: "Composite",
  fsf: "FSF",
  lnf: "LNF",
  psf: "PSF",
  nwf_cls: "NWF-CLS",
  nwf_wwr: "NWF-WWR",
  orf_words: "ORF Words",
  orf_accuracy: "ORF Acc%",
  retell: "Retell",
  retell_quality: "Retell Q",
  maze: "Maze",
};

/**
 * Get benchmark status for a score, falling back to mClass level for
 * historical data where we can't calculate Acadience benchmarks.
 */
function getStatus(grade, period, measure, scoreValue, scoreRow) {
  // First try Acadience benchmark calculation
  const result = getBenchmarkStatus(grade, period, measure, scoreValue);
  if (result) return result;

  // Fallback: use mClass-provided level
  if (scoreRow) {
    const levelKey = measure === "composite" ? "mclass_composite_level" : `${measure}_level`;
    const mclassLevel = scoreRow[levelKey];
    if (mclassLevel) return mclassLevelToStatus(mclassLevel);
  }
  return null;
}

function ScoreCell({ grade, period, measure, scoreValue, scoreRow }) {
  // For composite, show calculated Acadience composite if available,
  // otherwise fall back to mClass composite
  let displayValue = scoreValue;
  if (measure === "composite" && scoreValue == null && scoreRow?.mclass_composite != null) {
    displayValue = scoreRow.mclass_composite;
  }

  if (displayValue == null || displayValue === "") {
    return <td className="score-cell" style={{ color: "#cbd5e1" }}>—</td>;
  }

  const result = getStatus(grade, period, measure, scoreValue, scoreRow);
  const bg = result ? result.color + "22" : "transparent";
  const border = result ? result.color + "44" : "transparent";
  const color = result ? result.color : "#64748b";

  return (
    <td
      className="score-cell"
      style={{
        backgroundColor: bg,
        borderLeft: `3px solid ${border}`,
        color,
      }}
      title={measure === "composite" && scoreValue == null ? `mClass: ${displayValue}` : ""}
    >
      {typeof displayValue === "number" && !Number.isInteger(displayValue)
        ? displayValue.toFixed(1)
        : displayValue}
      {measure === "composite" && scoreValue == null && <span style={{ fontSize: 9, opacity: 0.6 }}> *</span>}
    </td>
  );
}

function SummaryBar({ statuses }) {
  const counts = { above: 0, at: 0, below: 0, wellBelow: 0 };
  for (const s of statuses) {
    if (!s) continue;
    if (s.status === STATUS.ABOVE.status) counts.above++;
    else if (s.status === STATUS.AT.status) counts.at++;
    else if (s.status === STATUS.BELOW.status) counts.below++;
    else if (s.status === STATUS.WELL_BELOW.status) counts.wellBelow++;
  }
  const total = counts.above + counts.at + counts.below + counts.wellBelow;
  if (total === 0) return <td className="score-cell">—</td>;

  const pct = (n) => ((n / total) * 100).toFixed(0);

  return (
    <td className="score-cell" style={{ padding: "4px 6px" }}>
      <div className="summary-bar">
        {counts.above > 0 && (
          <div className="seg" style={{ flex: counts.above, background: "#1D9E75" }}>
            {counts.above > 0 && pct(counts.above) + "%"}
          </div>
        )}
        {counts.at > 0 && (
          <div className="seg" style={{ flex: counts.at, background: "#4db892" }}>
            {pct(counts.at) + "%"}
          </div>
        )}
        {counts.below > 0 && (
          <div className="seg" style={{ flex: counts.below, background: "#EF9F27" }}>
            {pct(counts.below) + "%"}
          </div>
        )}
        {counts.wellBelow > 0 && (
          <div className="seg" style={{ flex: counts.wellBelow, background: "#D85A30" }}>
            {pct(counts.wellBelow) + "%"}
          </div>
        )}
      </div>
      <div className="summary-pct">n={total}</div>
    </td>
  );
}

export default function ClassroomSnapshot() {
  const years = getSchoolYears();
  const [year, setYear] = useState(years[0] || "");
  const periods = getPeriodsForYear(year);
  const [period, setPeriod] = useState("");
  const classes = getClassesForYear(year);
  const [classId, setClassId] = useState("");

  // Auto-select latest period and first class when year changes
  useMemo(() => {
    if (periods.length && !periods.includes(period)) {
      setPeriod(periods[periods.length - 1]);
    }
  }, [year, periods]);

  useMemo(() => {
    if (classes.length && !classes.find((c) => c.class_id === classId)) {
      setClassId(classes[0].class_id);
    }
  }, [year, classes]);

  const selectedClass = classes.find((c) => c.class_id === classId);
  const grade = selectedClass?.grade || "";
  const measures = getMeasuresForGradePeriod(grade, period) || [];
  const data = classId && period ? getClassScores(year, classId, period) : [];

  // Compute summary statuses per measure (with mClass fallback)
  const summaryByMeasure = {};
  for (const m of measures) {
    summaryByMeasure[m] = data.map((d) => {
      if (!d.score) return null;
      return getStatus(grade, period, m, d.score[m], d.score);
    });
  }

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

        <label>Class:</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.class_id} value={c.class_id}>
              Grade {c.grade} — {c.teacher} ({c.class_id})
            </option>
          ))}
        </select>

        {data.length > 0 && (<>
          <button
            className="btn-primary"
            onClick={() => {
              const doc = generateClassroomReport(selectedClass, data, grade, period, year);
              doc.save(`Classroom_${grade}_${period}_${year}.pdf`);
            }}
          >
            Snapshot PDF
          </button>
          <button
            className="btn-primary"
            style={{ background: "#1e40af" }}
            onClick={() => {
              const growthData = getClassGrowthData(year, classId);
              const doc = generateGrowthReport(selectedClass, growthData, grade, year);
              doc.save(`Growth_${grade}_${year}.pdf`);
            }}
          >
            Growth PDF
          </button>
        </>)}
      </div>

      {data.length === 0 ? (
        <div className="no-data">
          No scores found for this selection.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="score-table">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Student</th>
                {measures.map((m) => (
                  <th key={m} className="measure-col">
                    {MEASURE_LABELS[m] || m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Summary row */}
              <tr className="summary-row">
                <td style={{ fontWeight: 700, fontSize: 12, color: "#64748b" }}>
                  Class Summary
                </td>
                {measures.map((m) => (
                  <SummaryBar key={m} statuses={summaryByMeasure[m]} />
                ))}
              </tr>

              {/* Student rows */}
              {data.map(({ student, score }) => (
                <tr key={student.student_id}>
                  <td className="student-name">
                    <Link to={`/student/${student.student_id}`}>
                      {student.last_name}, {student.first_name}
                    </Link>
                  </td>
                  {measures.map((m) => (
                    <ScoreCell
                      key={m}
                      grade={grade}
                      period={period}
                      measure={m}
                      scoreValue={score?.[m]}
                      scoreRow={score}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
