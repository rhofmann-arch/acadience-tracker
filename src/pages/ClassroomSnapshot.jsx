import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getSchoolYears,
  getPeriodsForYear,
  getClassesForYear,
  getClassScores,
  getClassGrowthData,
  getCaptiClassScores,
} from "../lib/dataService";
import { generateClassroomReport, generateCaptiClassroomReport, generateGrowthReport } from "../lib/pdfReports";
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
  const isMclass = scoreRow?.data_source === "mClass";

  // For mClass composite, always use the mClass-provided level for consistency
  // (Acadience composite can't be reliably calculated without retell)
  if (isMclass && measure === "composite") {
    const level = scoreRow.mclass_composite_level;
    if (level) return mclassLevelToStatus(level);
    return null;
  }

  // Try Acadience benchmark calculation
  const result = getBenchmarkStatus(grade, period, measure, scoreValue);
  if (result) return result;

  // Fallback: use mClass-provided level for sub-scores
  if (scoreRow) {
    const levelKey = `${measure}_level`;
    const mclassLevel = scoreRow[levelKey];
    if (mclassLevel) return mclassLevelToStatus(mclassLevel);
  }
  return null;
}

function ScoreCell({ grade, period, measure, scoreValue, scoreRow }) {
  const isMclass = scoreRow?.data_source === "mClass";

  // For mClass data, always show mClass composite for consistency
  let displayValue = scoreValue;
  if (measure === "composite" && isMclass && scoreRow?.mclass_composite != null) {
    displayValue = scoreRow.mclass_composite;
  } else if (measure === "composite" && scoreValue == null && scoreRow?.mclass_composite != null) {
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
      title={measure === "composite" && isMclass ? `mClass composite: ${displayValue}` : ""}
    >
      {typeof displayValue === "number" && !Number.isInteger(displayValue)
        ? displayValue.toFixed(1)
        : displayValue}
      {measure === "composite" && isMclass && <span style={{ fontSize: 9, opacity: 0.6 }}> *</span>}
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

// ---------------------------------------------------------------------------
// Capti ReadBasix performance bands (Grades 5+)
// ---------------------------------------------------------------------------
const CAPTI_MEASURES = [
  { key: "word_recognition", label: "Word Recog." },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "morphology", label: "Morphology" },
  { key: "sentence_processing", label: "Sent. Processing" },
  { key: "reading_efficiency", label: "Reading Eff." },
  { key: "reading_comprehension", label: "Reading Comp." },
  { key: "lexile", label: "Lexile" },
];

function getCaptiColor(score) {
  if (score == null || score === "") return null;
  const n = typeof score === "number" ? score : Number(score);
  if (isNaN(n)) return null;
  if (n >= 265) return "#1D9E75";     // Strong (dark green)
  if (n >= 250) return "#1D9E75";     // High Average (green)
  if (n >= 236) return "#EF9F27";     // Low Average (amber)
  return "#D85A30";                    // Weak (red)
}

function getCaptiLabel(score) {
  if (score == null || score === "") return null;
  const n = typeof score === "number" ? score : Number(score);
  if (isNaN(n)) return null;
  if (n >= 265) return "strong";
  if (n >= 250) return "highAvg";
  if (n >= 236) return "lowAvg";
  return "weak";
}

function CaptiScoreCell({ value }) {
  if (value == null || value === "") {
    return <td className="score-cell" style={{ color: "#cbd5e1" }}>—</td>;
  }
  const color = getCaptiColor(value);
  const bg = color ? color + "22" : "transparent";
  const border = color ? color + "44" : "transparent";
  return (
    <td
      className="score-cell"
      style={{
        backgroundColor: bg,
        borderLeft: `3px solid ${border}`,
        color: color || "#64748b",
      }}
    >
      {value}
    </td>
  );
}

function CaptiSummaryBar({ scores }) {
  const counts = { strong: 0, highAvg: 0, lowAvg: 0, weak: 0 };
  for (const s of scores) {
    const label = getCaptiLabel(s);
    if (label) counts[label]++;
  }
  const total = counts.strong + counts.highAvg + counts.lowAvg + counts.weak;
  if (total === 0) return <td className="score-cell">—</td>;
  const pct = (n) => ((n / total) * 100).toFixed(0);

  return (
    <td className="score-cell" style={{ padding: "4px 6px" }}>
      <div className="summary-bar">
        {counts.strong > 0 && (
          <div className="seg" style={{ flex: counts.strong, background: "#1D9E75" }}>
            {pct(counts.strong) + "%"}
          </div>
        )}
        {counts.highAvg > 0 && (
          <div className="seg" style={{ flex: counts.highAvg, background: "#4db892" }}>
            {pct(counts.highAvg) + "%"}
          </div>
        )}
        {counts.lowAvg > 0 && (
          <div className="seg" style={{ flex: counts.lowAvg, background: "#EF9F27" }}>
            {pct(counts.lowAvg) + "%"}
          </div>
        )}
        {counts.weak > 0 && (
          <div className="seg" style={{ flex: counts.weak, background: "#D85A30" }}>
            {pct(counts.weak) + "%"}
          </div>
        )}
      </div>
      <div className="summary-pct">n={total}</div>
    </td>
  );
}

function isCaptiGrade(grade) {
  const g = grade === "K" ? 0 : parseInt(grade) || 0;
  return g >= 5;
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
  const useCapti = isCaptiGrade(grade);
  const scheduledMeasures = getMeasuresForGradePeriod(grade, period) || [];
  const data = classId && period ? getClassScores(year, classId, period) : [];
  const captiData = classId && period && useCapti ? getCaptiClassScores(year, classId, period) : [];

  // Build measure list: start with scheduled measures, then add any extra
  // measures that have data (mClass collected more than the Acadience minimum)
  const ALL_SCORE_MEASURES = [
    "composite", "fsf", "lnf", "psf", "nwf_cls", "nwf_wwr",
    "orf_words", "orf_accuracy", "retell", "retell_quality", "maze",
  ];
  const scheduled = new Set(scheduledMeasures);
  const extras = [];
  for (const m of ALL_SCORE_MEASURES) {
    if (scheduled.has(m)) continue;
    const hasData = data.some((d) => d.score != null && d.score[m] != null);
    if (hasData) extras.push(m);
  }
  const measures = [...scheduledMeasures, ...extras];

  // Compute summary statuses per measure (with mClass fallback)
  const summaryByMeasure = {};
  for (const m of measures) {
    summaryByMeasure[m] = data.map((d) => {
      if (!d.score) return null;
      return getStatus(grade, period, m, d.score[m], d.score);
    });
  }

  // For Capti: compute summary scores per measure
  const captiSummaryByMeasure = {};
  if (useCapti) {
    for (const { key } of CAPTI_MEASURES) {
      captiSummaryByMeasure[key] = captiData.map((d) => d.score?.[key] ?? null);
    }
  }

  const hasCaptiData = captiData.some((d) => d.score);
  const hasAcadienceData = data.length > 0;
  const showData = useCapti ? hasCaptiData : hasAcadienceData;

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
              {c.class_id}{c.teacher ? ` — ${c.teacher}` : ""}
            </option>
          ))}
        </select>

        {showData && (<>
          <button
            className="btn-primary"
            onClick={() => {
              if (useCapti) {
                const doc = generateCaptiClassroomReport(selectedClass, captiData, grade, period, year);
                doc.save(`Capti_Classroom_${grade}_${period}_${year}.pdf`);
              } else {
                const doc = generateClassroomReport(selectedClass, data, grade, period, year);
                doc.save(`Classroom_${grade}_${period}_${year}.pdf`);
              }
            }}
          >
            Snapshot PDF
          </button>
          {!useCapti && (
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
          )}
        </>)}
      </div>

      {!showData ? (
        <div className="no-data">
          No scores found for this selection.
        </div>
      ) : useCapti ? (
        /* --- Capti ReadBasix table for grade 5+ --- */
        <div style={{ overflowX: "auto" }}>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            Capti ReadBasix — Scale scores 190-310. Performance bands: Weak (190-235), Low Average (236-249), High Average (250-264), Strong (265-310).
          </p>
          <table className="score-table">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Student</th>
                {CAPTI_MEASURES.map((m) => (
                  <th key={m.key} className="measure-col">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Summary row */}
              <tr className="summary-row">
                <td style={{ fontWeight: 700, fontSize: 12, color: "#64748b" }}>
                  Class Summary
                </td>
                {CAPTI_MEASURES.map((m) => (
                  <CaptiSummaryBar key={m.key} scores={captiSummaryByMeasure[m.key] || []} />
                ))}
              </tr>

              {/* Student rows */}
              {captiData.map(({ student, score }) => (
                <tr key={student.student_id}>
                  <td className="student-name">
                    <Link to={`/student/${student.student_id}`}>
                      {student.last_name}, {student.first_name}
                    </Link>
                  </td>
                  {CAPTI_MEASURES.map((m) => (
                    <CaptiScoreCell key={m.key} value={score?.[m.key]} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* --- Acadience table for K-4 --- */
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
