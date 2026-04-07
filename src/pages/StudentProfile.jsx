import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getStudent,
  getStudentHistory,
  getStudentPMScores,
  getDiagnostics,
  addDiagnostic,
  getIowaScores,
  searchStudents,
  submitScore,
  isSheetsMode,
  subscribe,
} from "../lib/dataService";
import {
  getBenchmarkStatus,
  getMeasuresForGradePeriod,
  mclassLevelToStatus,
} from "../lib/scoringEngine";
import { validateScore } from "../lib/assessmentConfig";
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
  orf_errors: "ORF Errors",
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
    return <td className="score-cell" style={{ color: "#cbd5e1" }}>--</td>;
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

// ---------------------------------------------------------------------------
// PM Score Entry Form (reuses subtest card UI pattern from AssessmentManager)
// ---------------------------------------------------------------------------
function PMScoreEntryForm({ studentId, onDone }) {
  const student = getStudent(studentId);
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [assessor, setAssessor] = useState("");
  const [scores, setScores] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Determine grade and year from most recent enrollment/history
  useEffect(() => {
    const history = getStudentHistory(studentId);
    if (history.length > 0) {
      const latest = history[history.length - 1];
      setGrade(latest.grade || "");
      setSchoolYear(latest.school_year || "");
    }
  }, [studentId]);

  // Get available measures for this grade (use MOY as a representative period for PM)
  const period = "MOY";
  const measures = getMeasuresForGradePeriod(grade, period) || [];

  function handleScoreChange(measure, value) {
    setScores((prev) => ({ ...prev, [measure]: value }));
    const result = validateScore(measure, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (result.valid) delete next[measure];
      else next[measure] = result.error;
      return next;
    });

    if (measure === "orf_words" || measure === "orf_errors") {
      const words = measure === "orf_words" ? Number(value) : Number(scores.orf_words);
      const errCount = measure === "orf_errors" ? Number(value) : Number(scores.orf_errors);
      if (!isNaN(words) && !isNaN(errCount) && words > 0) {
        const attempted = words + errCount;
        const accuracy = Math.round((words / attempted) * 100);
        setScores((prev) => ({ ...prev, orf_accuracy: String(accuracy) }));
      }
    }
  }

  async function handleSubmit() {
    if (!grade || !schoolYear) {
      setMessage("Grade and school year are required.");
      return;
    }

    setSubmitting(true);
    try {
      const scoreData = {
        student_id: studentId,
        school_year: schoolYear,
        grade,
        period: "PM",
        assessment_date: assessmentDate,
        data_source: "Acadience",
        assessor,
        assessment_type: "progress_monitoring",
      };

      for (const m of measures) {
        const val = scores[m];
        scoreData[m] = val !== "" && val != null ? Number(val) : "";
      }
      if (scores.orf_errors != null && scores.orf_errors !== "") {
        scoreData.orf_errors = Number(scores.orf_errors);
      }

      await submitScore(scoreData);
      setMessage("PM score submitted!");
      setScores({});
      setTimeout(() => onDone(), 500);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!student) return null;

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h4>Add Progress Monitoring Score</h4>
      <div className="filters" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <label>Date:</label>
        <input type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} className="field-input" />
        <label>Grade:</label>
        <input value={grade} onChange={(e) => setGrade(e.target.value)} className="field-input" style={{ width: 60 }} />
        <label>Year:</label>
        <input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} className="field-input" style={{ width: 120 }} />
        <label>Assessor:</label>
        <input value={assessor} onChange={(e) => setAssessor(e.target.value)} className="field-input" placeholder="Your name" />
      </div>

      {message && <p className="panel-message">{message}</p>}

      <div className="subtest-grid">
        {measures.filter((m) => m !== "composite").map((m) => (
          <div key={m} className="subtest-card">
            <div className="subtest-header">
              <span className="subtest-name">{MEASURE_LABELS[m] || m}</span>
            </div>
            <div className="subtest-input-row">
              <label>Score:</label>
              <input
                type="number"
                className={`score-input ${errors[m] ? "input-error" : ""}`}
                value={scores[m] ?? ""}
                onChange={(e) => handleScoreChange(m, e.target.value)}
              />
              {errors[m] && <span className="input-error-msg">{errors[m]}</span>}
            </div>
            {m === "orf_words" && (
              <div className="subtest-input-row" style={{ marginTop: 6 }}>
                <label>errors:</label>
                <input
                  type="number"
                  className="score-input"
                  value={scores.orf_errors ?? ""}
                  onChange={(e) => handleScoreChange("orf_errors", e.target.value)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit PM Score"}
        </button>
        <button className="btn-small" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics Add Form
// ---------------------------------------------------------------------------
function DiagnosticAddForm({ studentId, onDone }) {
  const [testName, setTestName] = useState("");
  const [assessor, setAssessor] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [findings, setFindings] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!testName.trim()) {
      setMessage("Test name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await addDiagnostic({
        student_id: studentId,
        test_name: testName,
        assessor,
        assessment_date: date,
        findings,
        notes,
      });
      setMessage("Diagnostic added!");
      setTimeout(() => onDone(), 500);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h4>Add Diagnostic Entry</h4>
      {message && <p className="panel-message">{message}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 600 }}>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block" }}>Test Name *</label>
          <input className="field-input" value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="e.g. Acadience Reading Diagnostic" style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block" }}>Assessor</label>
          <input className="field-input" value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="Your name" style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block" }}>Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block" }}>Findings</label>
          <textarea className="field-input" value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} placeholder="Key findings from the diagnostic assessment..." style={{ width: "100%", resize: "vertical" }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block" }}>Notes</label>
          <textarea className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes..." style={{ width: "100%", resize: "vertical" }} />
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Save Diagnostic"}
        </button>
        <button className="btn-small" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Monitoring Tab
// ---------------------------------------------------------------------------
function PMTab({ studentId }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [, setTick] = useState(0);
  const sheetsConnected = isSheetsMode();

  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);

  const pmScores = getStudentPMScores(studentId);

  // Collect all measures with data across PM scores
  const ALL_MEASURES = [
    "composite", "fsf", "lnf", "psf", "nwf_cls", "nwf_wwr",
    "orf_words", "orf_accuracy", "retell", "retell_quality", "maze",
  ];
  const measuresWithData = ALL_MEASURES.filter((m) =>
    pmScores.some((s) => s[m] != null && s[m] !== "")
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Progress Monitoring Scores</h3>
        {sheetsConnected && !showAddForm && (
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            + Add PM Score
          </button>
        )}
      </div>

      {showAddForm && (
        <PMScoreEntryForm
          studentId={studentId}
          onDone={() => setShowAddForm(false)}
        />
      )}

      {pmScores.length === 0 ? (
        <div className="no-data">No progress monitoring scores recorded.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="score-table">
            <thead>
              <tr>
                <th style={{ minWidth: 100 }}>Date</th>
                <th>Grade</th>
                <th>Assessor</th>
                {measuresWithData.map((m) => (
                  <th key={m} className="measure-col">{MEASURE_LABELS[m] || m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pmScores.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.assessment_date || "N/A"}</td>
                  <td>{row.grade}</td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{row.assessor || ""}</td>
                  {measuresWithData.map((m) => (
                    <ScoreCell
                      key={m}
                      grade={row.grade}
                      period={row.period === "PM" ? "MOY" : row.period}
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics Tab
// ---------------------------------------------------------------------------
function DiagnosticsTab({ studentId }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [, setTick] = useState(0);
  const sheetsConnected = isSheetsMode();

  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);

  const diagnostics = getDiagnostics(studentId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Diagnostic Assessments</h3>
        {sheetsConnected && !showAddForm && (
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            + Add Diagnostic
          </button>
        )}
      </div>

      {showAddForm && (
        <DiagnosticAddForm
          studentId={studentId}
          onDone={() => setShowAddForm(false)}
        />
      )}

      {diagnostics.length === 0 ? (
        <div className="no-data">No diagnostic assessments recorded.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {diagnostics.map((d, i) => (
            <div key={i} className="panel" style={{ padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{d.test_name}</strong>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {d.assessment_date}{d.assessor && ` -- Assessor: ${d.assessor}`}
                  </div>
                </div>
              </div>
              {d.findings && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Findings</div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{d.findings}</div>
                </div>
              )}
              {d.notes && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#64748b" }}>{d.notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmarks Tab (original view)
// ---------------------------------------------------------------------------
function BenchmarksTab({ student, history }) {
  // Group history by school year
  const byYear = {};
  for (const row of history) {
    if (!byYear[row.school_year]) byYear[row.school_year] = [];
    byYear[row.school_year].push(row);
  }

  return (
    <div>
      {Object.keys(byYear).length === 0 && (
        <div className="no-data">No benchmark score history found.</div>
      )}

      {Object.entries(byYear).map(([yr, rows]) => {
        const grade = rows[0].grade;
        const allMeasures = new Set();
        for (const row of rows) {
          const ms = getMeasuresForGradePeriod(row.grade, row.period);
          if (ms) ms.forEach((m) => allMeasures.add(m));
        }
        const measures = [...allMeasures];

        return (
          <div key={yr} className="year-section">
            <h3>
              {yr} -- Grade {grade}
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
  );
}

// ---------------------------------------------------------------------------
// Main StudentProfile Component
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Iowa Assessments Tab
// ---------------------------------------------------------------------------
const IOWA_ELA_FIELDS = [
  { key: "reading", label: "Reading" },
  { key: "language", label: "Language" },
  { key: "written_expression", label: "Written Expression" },
  { key: "conventions", label: "Conventions of Writing" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "ela_total", label: "ELA Total" },
  { key: "word_analysis", label: "Word Analysis" },
  { key: "listening", label: "Listening" },
  { key: "extended_ela", label: "Extended ELA" },
];

function IowaTab({ studentId }) {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);

  const scores = getIowaScores(studentId);

  if (scores.length === 0) {
    return (
      <div className="no-data">
        No Iowa Assessment scores on file for this student.
      </div>
    );
  }

  // Determine which fields have data across all years
  const activeFields = IOWA_ELA_FIELDS.filter((f) =>
    scores.some((s) => s[`${f.key}_npr`] != null || s[`${f.key}_ge`])
  );

  return (
    <div>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Iowa Assessments — English Language Arts. NPR = National Percentile Rank, GE = Grade Equivalent.
      </p>
      {scores.map((s) => (
        <div key={s.school_year} className="year-section">
          <h3>
            {s.school_year} — Grade {s.grade_tested} (tested {s.test_date})
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="score-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 60 }}></th>
                  {activeFields.map((f) => (
                    <th key={f.key} className="measure-col">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, fontSize: 12, color: "#64748b" }}>NPR</td>
                  {activeFields.map((f) => {
                    const val = s[`${f.key}_npr`];
                    const color = val != null
                      ? val >= 75 ? "#1D9E75" : val >= 50 ? "#1D9E75" : val >= 25 ? "#EF9F27" : "#D85A30"
                      : "#cbd5e1";
                    const bg = val != null
                      ? val >= 75 ? "#1D9E7522" : val >= 50 ? "transparent" : val >= 25 ? "#EF9F2722" : "#D85A3022"
                      : "transparent";
                    return (
                      <td key={f.key} className="score-cell" style={{ color, backgroundColor: bg }}>
                        {val != null ? val : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, fontSize: 12, color: "#64748b" }}>GE</td>
                  {activeFields.map((f) => {
                    const val = s[`${f.key}_ge`];
                    return (
                      <td key={f.key} className="score-cell" style={{ color: "#475569" }}>
                        {val || "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState("benchmarks");

  const student = studentId ? getStudent(studentId) : null;
  const history = studentId ? getStudentHistory(studentId) : [];
  const iowaScores = studentId ? getIowaScores(studentId) : [];
  const results = searchStudents(query);

  // Determine current grade from most recent history
  const currentGrade = history.length > 0 ? history[history.length - 1].grade : null;
  const gradeNum = currentGrade === "K" ? 0 : parseInt(currentGrade) || 0;
  const showIowa = gradeNum >= 3 || iowaScores.length > 0;

  // Reset tab when student changes
  useEffect(() => {
    setActiveTab("benchmarks");
  }, [studentId]);

  const TAB_STYLE = (tabKey) => ({
    padding: "8px 16px",
    border: "none",
    borderBottom: activeTab === tabKey ? "3px solid #2563eb" : "3px solid transparent",
    background: activeTab === tabKey ? "#eff6ff" : "transparent",
    color: activeTab === tabKey ? "#1e40af" : "#64748b",
    fontWeight: activeTab === tabKey ? 600 : 400,
    cursor: "pointer",
    fontSize: 14,
  });

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
                  const pmScores = getStudentPMScores(studentId);
                  const doc = generateStudentReport(student, history, pmScores);
                  doc.save(`${student.last_name}_${student.first_name}_reading_report.pdf`);
                }}
              >
                Download PDF
              </button>
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 16, marginTop: 12 }}>
            <button style={TAB_STYLE("benchmarks")} onClick={() => setActiveTab("benchmarks")}>
              Benchmarks
            </button>
            <button style={TAB_STYLE("pm")} onClick={() => setActiveTab("pm")}>
              Progress Monitoring
            </button>
            <button style={TAB_STYLE("diagnostics")} onClick={() => setActiveTab("diagnostics")}>
              Diagnostics
            </button>
            {showIowa && (
              <button style={TAB_STYLE("iowa")} onClick={() => setActiveTab("iowa")}>
                Iowa Assessments
              </button>
            )}
          </div>

          {/* Tab content */}
          {activeTab === "benchmarks" && (
            <BenchmarksTab student={student} history={history} />
          )}
          {activeTab === "pm" && (
            <PMTab studentId={studentId} />
          )}
          {activeTab === "diagnostics" && (
            <DiagnosticsTab studentId={studentId} />
          )}
          {activeTab === "iowa" && (
            <IowaTab studentId={studentId} />
          )}
        </div>
      )}
    </div>
  );
}
