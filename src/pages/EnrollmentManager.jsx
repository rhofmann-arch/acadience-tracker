import { useState, useEffect, useCallback } from "react";
import {
  getSchoolYears,
  getEnrollmentForYear,
  getStudentsNeedingIds,
  updateStudentId,
  updateEnrollment,
  setStudentActive,
  rolloverYear,
  exportCsv,
  subscribe,
} from "../lib/dataService";

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// ID Resolution Panel
// ---------------------------------------------------------------------------
function IdResolutionPanel() {
  const [needsIds, setNeedsIds] = useState(getStudentsNeedingIds());
  const [edits, setEdits] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => subscribe(() => setNeedsIds(getStudentsNeedingIds())), []);

  const handleSave = async (oldId) => {
    const newId = edits[oldId]?.trim();
    if (!newId) return;
    if (!/^\d{4}$/.test(newId)) {
      setMessage(`"${newId}" is not a valid 4-digit SIS ID.`);
      return;
    }
    try {
      await updateStudentId(oldId, newId);
      setEdits((prev) => { const next = { ...prev }; delete next[oldId]; return next; });
      setMessage(`Updated ${oldId} → ${newId}`);
    } catch (e) {
      setMessage(e.message);
    }
  };

  if (needsIds.length === 0) {
    return (
      <div className="panel">
        <h3>ID Resolution</h3>
        <p className="panel-ok">All students have valid 4-digit SIS IDs.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>ID Resolution — {needsIds.length} students need SIS IDs</h3>
      {message && <p className="panel-message">{message}</p>}
      <table className="enroll-table">
        <thead>
          <tr>
            <th>Current ID</th>
            <th>Last Name</th>
            <th>First Name</th>
            <th>New SIS ID</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {needsIds.map((s) => (
            <tr key={s.student_id}>
              <td className="mono">{s.student_id}</td>
              <td>{s.last_name}</td>
              <td>{s.first_name}</td>
              <td>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="0000"
                  className="id-input"
                  value={edits[s.student_id] || ""}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [s.student_id]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleSave(s.student_id)}
                />
              </td>
              <td>
                <button
                  className="btn-small"
                  onClick={() => handleSave(s.student_id)}
                  disabled={!edits[s.student_id]?.trim()}
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enrollment Editor
// ---------------------------------------------------------------------------
function EnrollmentEditor() {
  const years = getSchoolYears();
  const [year, setYear] = useState(years[0] || "");
  const [enrollment, setEnrollment] = useState([]);
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    setEnrollment(getEnrollmentForYear(year));
  }, [year]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => subscribe(refresh), [refresh]);

  const handleFieldChange = (studentId, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value },
    }));
  };

  const handleSave = async (studentId) => {
    const changes = edits[studentId];
    if (!changes) return;
    await updateEnrollment(studentId, year, changes);
    setEdits((prev) => { const next = { ...prev }; delete next[studentId]; return next; });
    setMessage(`Updated enrollment for ${studentId}`);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleDeactivate = async (studentId) => {
    await setStudentActive(studentId, false);
    setMessage(`Marked ${studentId} as inactive (transferred)`);
    setTimeout(() => setMessage(""), 3000);
  };

  const filtered = enrollment.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.student?.first_name?.toLowerCase().includes(q) ||
      e.student?.last_name?.toLowerCase().includes(q) ||
      e.student_id.includes(q) ||
      e.grade.includes(q) ||
      e.teacher?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="panel">
      <h3>Enrollment — {year}</h3>
      <div className="filters" style={{ marginBottom: 12 }}>
        <label>Year:</label>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by name, ID, grade, teacher..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 280 }}
        />
        <span style={{ color: "#64748b", fontSize: 12 }}>{filtered.length} students</span>
      </div>
      {message && <p className="panel-message">{message}</p>}
      <table className="enroll-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Student</th>
            <th>Grade</th>
            <th>Teacher</th>
            <th>Class</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => {
            const edit = edits[e.student_id] || {};
            const isDirty = Object.keys(edit).length > 0;
            return (
              <tr key={e.student_id} className={e.student?.active === "FALSE" ? "inactive-row" : ""}>
                <td className="mono">{e.student_id}</td>
                <td>
                  {e.student?.last_name}, {e.student?.first_name}
                </td>
                <td>
                  <select
                    value={edit.grade ?? e.grade}
                    onChange={(ev) => handleFieldChange(e.student_id, "grade", ev.target.value)}
                  >
                    {GRADES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="field-input"
                    value={edit.teacher ?? e.teacher}
                    onChange={(ev) => handleFieldChange(e.student_id, "teacher", ev.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="field-input"
                    value={edit.class_id ?? e.class_id}
                    onChange={(ev) => handleFieldChange(e.student_id, "class_id", ev.target.value)}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {isDirty && (
                    <button className="btn-small" onClick={() => handleSave(e.student_id)}>
                      Save
                    </button>
                  )}
                  <button
                    className="btn-small btn-muted"
                    onClick={() => handleDeactivate(e.student_id)}
                    title="Mark as transferred"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year Rollover
// ---------------------------------------------------------------------------
function YearRollover() {
  const years = getSchoolYears();
  const [fromYear, setFromYear] = useState(years[0] || "");
  const [toYear, setToYear] = useState("");
  const [message, setMessage] = useState("");

  // Auto-suggest next year
  useEffect(() => {
    if (fromYear) {
      const start = parseInt(fromYear.split("-")[0]);
      setToYear(`${start + 1}-${start + 2}`);
    }
  }, [fromYear]);

  const handleRollover = async () => {
    if (!fromYear || !toYear) return;
    const count = await rolloverYear(fromYear, toYear);
    setMessage(
      count > 0
        ? `Created ${count} enrollment records for ${toYear}. Edit teacher/class assignments below.`
        : `All students from ${fromYear} already enrolled in ${toYear}.`
    );
  };

  return (
    <div className="panel">
      <h3>Year Rollover</h3>
      <p className="panel-desc">
        Promote all students from one year to the next. Grades advance automatically.
        You can edit teacher and class assignments in the Enrollment section after rollover.
      </p>
      <div className="filters">
        <label>From:</label>
        <select value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <label>To:</label>
        <input
          type="text"
          value={toYear}
          onChange={(e) => setToYear(e.target.value)}
          placeholder="2026-2027"
          style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 100 }}
        />
        <button className="btn-primary" onClick={handleRollover}>
          Rollover
        </button>
      </div>
      {message && <p className="panel-message">{message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function ExportPanel() {
  return (
    <div className="panel">
      <h3>Export Data</h3>
      <p className="panel-desc">
        Download the current state of data as CSV files (for pasting into Google Sheets).
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={() => downloadFile(exportCsv("students"), "students.csv")}>
          Students CSV
        </button>
        <button className="btn-primary" onClick={() => downloadFile(exportCsv("enrollment"), "enrollment.csv")}>
          Enrollment CSV
        </button>
        <button className="btn-primary" onClick={() => downloadFile(exportCsv("scores"), "scores.csv")}>
          Scores CSV
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EnrollmentManager() {
  return (
    <div>
      <IdResolutionPanel />
      <EnrollmentEditor />
      <YearRollover />
      <ExportPanel />
    </div>
  );
}
