import { useState, useEffect, useCallback } from "react";
import {
  getSchoolYears,
  getClassesForYear,
  getClassScores,
  getStudent,
  submitScore,
  subscribe,
} from "../lib/dataService";
import {
  getMeasuresForGradePeriod,
  MEASURE_SCHEDULE,
} from "../lib/scoringEngine";
import {
  getAssessmentSession,
  validateScore,
  SUBTEST_INFO,
  PRINTABLE_MATERIALS,
} from "../lib/assessmentConfig";
import {
  saveDraft,
  loadDraft,
  deleteDraft,
  listDrafts,
} from "../lib/draftStore";

// ---------------------------------------------------------------------------
// Session Setup — select year, period, class
// ---------------------------------------------------------------------------
function SessionSetup({ onStart }) {
  const years = getSchoolYears();
  const [year, setYear] = useState(years[0] || "2025-2026");
  const [period, setPeriod] = useState("BOY");
  const classes = getClassesForYear(year);
  const [classId, setClassId] = useState(classes[0]?.class_id || "");

  useEffect(() => {
    if (classes.length && !classes.find((c) => c.class_id === classId)) {
      setClassId(classes[0].class_id);
    }
  }, [year, classes]);

  const selectedClass = classes.find((c) => c.class_id === classId);

  // Check for pending drafts
  const drafts = listDrafts(year, period);

  return (
    <div className="panel">
      <h3>Start Assessment Session</h3>
      <p className="panel-desc">
        Select the class and benchmark period to assess. You'll see a list of students
        and can enter scores for each one.
      </p>
      <div className="filters" style={{ marginBottom: 12 }}>
        <label>Year:</label>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <label>Period:</label>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option>BOY</option>
          <option>MOY</option>
          <option>EOY</option>
        </select>
        <label>Class:</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.class_id} value={c.class_id}>
              Grade {c.grade} — {c.teacher} ({c.class_id})
            </option>
          ))}
        </select>
      </div>

      {selectedClass && !MEASURE_SCHEDULE[selectedClass.grade]?.[period] && (
        <p className="panel-message" style={{ background: "#fef3c7", color: "#92400e" }}>
          No assessments scheduled for Grade {selectedClass.grade} {period}.
          {selectedClass.grade === "K" && period === "BOY" && " (Kindergarten testing begins at MOY.)"}
        </p>
      )}

      {selectedClass && MEASURE_SCHEDULE[selectedClass.grade]?.[period] && (
        <button
          className="btn-primary"
          onClick={() => onStart({ year, period, classId, grade: selectedClass.grade, classInfo: selectedClass })}
        >
          Begin Assessing — Grade {selectedClass.grade} {period}
        </button>
      )}

      {drafts.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
          {drafts.length} saved draft{drafts.length > 1 ? "s" : ""} for {year} {period}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student List — shows assessment progress for the class
// ---------------------------------------------------------------------------
function StudentList({ session, onSelect, selectedId }) {
  const { year, period, classId, grade } = session;
  const [students, setStudents] = useState([]);

  const refresh = useCallback(() => {
    const data = getClassScores(year, classId, period);
    // Also check for drafts
    const withStatus = data.map(({ student, score }) => {
      const draft = loadDraft(student.student_id, year, period);
      let status = "not_started";
      if (score) status = "submitted";
      else if (draft) status = "draft";
      return { student, score, draft, status };
    });
    setStudents(withStatus);
  }, [year, classId, period]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => subscribe(refresh), [refresh]);

  const submitted = students.filter((s) => s.status === "submitted").length;
  const drafts = students.filter((s) => s.status === "draft").length;
  const total = students.length;

  return (
    <div className="panel" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <h3>
        Grade {grade} {period} — {session.classInfo.teacher} ({classId})
      </h3>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
        {submitted}/{total} submitted
        {drafts > 0 && ` · ${drafts} in progress`}
      </div>
      <div className="student-list">
        {students.map(({ student, status }) => (
          <div
            key={student.student_id}
            className={`student-list-item ${selectedId === student.student_id ? "selected" : ""} ${status}`}
            onClick={() => onSelect(student.student_id)}
          >
            <span className="student-list-name">
              {student.last_name}, {student.first_name}
            </span>
            <span className={`student-list-status status-${status}`}>
              {status === "submitted" ? "Done" : status === "draft" ? "In Progress" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Entry Form — enter scores for one student
// ---------------------------------------------------------------------------
function ScoreEntryForm({ session, studentId, onDone }) {
  const { year, period, grade } = session;
  const student = getStudent(studentId);
  const subtests = getAssessmentSession(grade, period) || [];
  const [scores, setScores] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [assessor, setAssessor] = useState("");

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft(studentId, year, period);
    if (draft) {
      setScores(draft.scores || {});
      setMessage("Resumed from saved draft.");
    } else {
      setScores({});
      setMessage("");
    }
    setErrors({});
  }, [studentId, year, period]);

  function handleScoreChange(measure, value) {
    setScores((prev) => ({ ...prev, [measure]: value }));
    // Validate
    const result = validateScore(measure, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (result.valid) delete next[measure];
      else next[measure] = result.error;
      return next;
    });

    // Auto-calculate ORF accuracy if we have words and errors
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

  function handleSaveDraft() {
    saveDraft(studentId, year, period, scores);
    setMessage("Draft saved.");
  }

  async function handleSubmit() {
    // Validate all fields
    const newErrors = {};
    for (const sub of subtests) {
      const val = scores[sub.measure];
      const result = validateScore(sub.measure, val);
      if (!result.valid) newErrors[sub.measure] = result.error;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      setMessage("Fix errors before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const scoreData = {
        student_id: studentId,
        school_year: year,
        grade,
        period,
        assessment_date: new Date().toISOString().split("T")[0],
        data_source: "Acadience",
        assessor: assessor,
      };

      // Add all sub-scores
      for (const sub of subtests) {
        const val = scores[sub.measure];
        scoreData[sub.measure] = val !== "" && val != null ? Number(val) : "";
      }

      await submitScore(scoreData);
      deleteDraft(studentId, year, period);
      setMessage("Submitted!");
      setScores({});

      // Move to next student after brief delay
      setTimeout(() => onDone(studentId), 500);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!student) return null;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3>{student.first_name} {student.last_name}</h3>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            ID: {student.student_id} · Grade {grade} · {period} · {year}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-small" onClick={handleSaveDraft}>Save Draft</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Scores"}
          </button>
        </div>
      </div>

      {message && <p className="panel-message">{message}</p>}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "#64748b" }}>Assessor:</label>
        <input
          className="field-input"
          value={assessor}
          onChange={(e) => setAssessor(e.target.value)}
          placeholder="Your name"
          style={{ marginLeft: 8 }}
        />
      </div>

      <div className="subtest-grid">
        {subtests.map((sub) => {
          const isCalculated = sub.measure === "orf_accuracy" && scores.orf_words && scores.orf_errors;
          return (
            <div key={sub.measure} className="subtest-card">
              <div className="subtest-header">
                <span className="subtest-name">{sub.name}</span>
                <span className="subtest-timing">{sub.timing}</span>
              </div>
              <div className="subtest-directions">{sub.directions}</div>
              {sub.tips && (
                <div className="subtest-tips">{sub.tips}</div>
              )}
              <div className="subtest-input-row">
                <label>{sub.scoreUnit}:</label>
                <input
                  type="number"
                  className={`score-input ${errors[sub.measure] ? "input-error" : ""}`}
                  value={scores[sub.measure] ?? ""}
                  onChange={(e) => handleScoreChange(sub.measure, e.target.value)}
                  placeholder={sub.validRange ? `${sub.validRange[0]}–${sub.validRange[1]}` : ""}
                  readOnly={sub.calculated && isCalculated}
                />
                {errors[sub.measure] && (
                  <span className="input-error-msg">{errors[sub.measure]}</span>
                )}
                {sub.calculated && isCalculated && (
                  <span style={{ fontSize: 11, color: "#64748b" }}>(auto-calculated)</span>
                )}
              </div>

              {/* Show ORF errors field alongside ORF words */}
              {sub.measure === "orf_words" && (
                <div className="subtest-input-row" style={{ marginTop: 6 }}>
                  <label>errors:</label>
                  <input
                    type="number"
                    className="score-input"
                    value={scores.orf_errors ?? ""}
                    onChange={(e) => handleScoreChange("orf_errors", e.target.value)}
                    placeholder=""
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    (used to calculate accuracy)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Assessment Manager
// ---------------------------------------------------------------------------
export default function AssessmentManager() {
  const [session, setSession] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  function handleStart(sessionInfo) {
    setSession(sessionInfo);
    setSelectedStudentId(null);
  }

  function handleStudentDone(completedId) {
    // Auto-advance to next student could go here
    setSelectedStudentId(null);
  }

  if (!session) {
    return <SessionSetup onStart={handleStart} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-small" onClick={() => setSession(null)}>
          &larr; Back to Setup
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          Assessing: Grade {session.grade} {session.period} — {session.classInfo.teacher} ({session.classId})
        </span>
      </div>
      <div className="assess-layout">
        <div className="assess-sidebar">
          <StudentList
            session={session}
            onSelect={setSelectedStudentId}
            selectedId={selectedStudentId}
          />
        </div>
        <div className="assess-main">
          {selectedStudentId ? (
            <ScoreEntryForm
              session={session}
              studentId={selectedStudentId}
              onDone={handleStudentDone}
            />
          ) : (
            <div className="panel">
              <div className="no-data">
                Select a student from the list to begin entering scores.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
