import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getStudent,
  getStudentHistory,
  searchStudents,
} from "../lib/dataService";
import {
  getBenchmarkStatus,
  getMeasuresForGradePeriod,
  mclassLevelToStatus,
} from "../lib/scoringEngine";
import { generateStudentReport } from "../lib/pdfReports";

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

function getStatus(grade, period, measure, scoreValue, scoreRow) {
  const isMclass = scoreRow?.data_source === "mClass";

  if (isMclass && measure === "composite") {
    const level = scoreRow.mclass_composite_level;
    if (level) return mclassLevelToStatus(level);
    return null;
  }

  const result = getBenchmarkStatus(grade, period, measure, scoreValue);
  if (result) return result;

  if (scoreRow) {
    const levelKey = `${measure}_level`;
    const mclassLevel = scoreRow[levelKey];
    if (mclassLevel) return mclassLevelToStatus(mclassLevel);
  }
  return null;
}

function ScoreCell({ grade, period, measure, scoreValue, scoreRow }) {
  const isMclass = scoreRow?.data_source === "mClass";

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

export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const student = studentId ? getStudent(studentId) : null;
  const history = studentId ? getStudentHistory(studentId) : [];
  const results = searchStudents(query);

  // Group history by school year
  const byYear = {};
  for (const row of history) {
    if (!byYear[row.school_year]) byYear[row.school_year] = [];
    byYear[row.school_year].push(row);
  }

  return (
    <div>
      <div className="search-box" style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by student name or ID..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
        />
        {showResults && results.length > 0 && (
          <div className="search-results">
            {results.map((s) => (
              <div
                key={s.student_id}
                className="result-item"
                onMouseDown={() => {
                  navigate(`/student/${s.student_id}`);
                  setQuery("");
                  setShowResults(false);
                }}
              >
                <strong>{s.last_name}, {s.first_name}</strong>
                <span style={{ color: "#94a3b8", marginLeft: 8 }}>
                  ID: {s.student_id}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!student && (
        <div className="no-data">
          Search for a student above to view their longitudinal profile.
        </div>
      )}

      {student && (
        <div>
          <div className="profile-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2>
                {student.first_name} {student.last_name}
              </h2>
              <div className="profile-meta">
                ID: {student.student_id}
                {student.cohort_year && ` · Cohort: ${student.cohort_year}`}
                {student.dob && ` · DOB: ${student.dob}`}
              </div>
            </div>
            {history.length > 0 && (
              <button
                className="btn-primary"
                onClick={() => {
                  const doc = generateStudentReport(student, history);
                  doc.save(`${student.last_name}_${student.first_name}_reading_report.pdf`);
                }}
              >
                Download PDF
              </button>
            )}
          </div>

          {Object.keys(byYear).length === 0 && (
            <div className="no-data">No score history found.</div>
          )}

          {Object.entries(byYear).map(([yr, rows]) => {
            const grade = rows[0].grade;
            // Collect all measures across all periods for this year
            const allMeasures = new Set();
            for (const row of rows) {
              const ms = getMeasuresForGradePeriod(row.grade, row.period);
              if (ms) ms.forEach((m) => allMeasures.add(m));
            }
            const measures = [...allMeasures];

            return (
              <div key={yr} className="year-section">
                <h3>
                  {yr} — Grade {grade}
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 80 }}>Period</th>
                        {measures.map((m) => (
                          <th key={m} className="measure-col">
                            {MEASURE_LABELS[m] || m}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.period}>
                          <td style={{ fontWeight: 600 }}>{row.period}</td>
                          {measures.map((m) => (
                            <ScoreCell
                              key={m}
                              grade={row.grade}
                              period={row.period}
                              measure={m}
                              scoreValue={row[m]}
                              scoreRow={row}
                            />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
