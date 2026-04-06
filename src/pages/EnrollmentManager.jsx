import { useState, useEffect, useCallback } from "react";
import {
  getSchoolYears,
  getEnrollmentForYear,
  getStudentsNeedingIds,
  updateStudentId,
  updateEnrollment,
  setStudentActive,
  rolloverYear,
  addStudent,
  addStudentsBatch,
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
// Add Students
// ---------------------------------------------------------------------------
function AddStudentsPanel() {
  const [mode, setMode] = useState("paste"); // "paste", "csv", "single"
  const [pasteText, setPasteText] = useState("");
  const [schoolYear, setSchoolYear] = useState("2026-2027");
  const [defaultGrade, setDefaultGrade] = useState("K");
  const [defaultTeacher, setDefaultTeacher] = useState("");
  const [defaultClassId, setDefaultClassId] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState([]);

  // Single student fields
  const [singleId, setSingleId] = useState("");
  const [singleFirst, setSingleFirst] = useState("");
  const [singleLast, setSingleLast] = useState("");
  const [singleDob, setSingleDob] = useState("");
  const [singleGrade, setSingleGrade] = useState("K");

  function parseRoster(text) {
    const lines = text.trim().split("\n").filter((l) => l.trim());
    const entries = [];

    for (const line of lines) {
      // Try to parse various formats:
      // "Last, First", ID, Grade, Gender, DOB  (SIS roster format)
      // Last, First, ID, Grade  (simple paste)
      // ID, First, Last, Grade  (alternate)
      const parts = line.split(/[,\t]+/).map((s) => s.trim().replace(/^"|"$/g, ""));

      // Skip header-like rows
      if (parts.some((p) => /^(name|student|id|grade|gender)$/i.test(p))) continue;
      // Skip row number prefix
      let cols = parts;
      if (/^\d+$/.test(cols[0]) && cols.length > 3) cols = cols.slice(1);

      let entry = null;

      // Format: "Last, First" (quoted with comma), ID, Grade, ...
      // After split on comma: ["Last", "First"", ID, Grade, ...]
      // Try to detect "Last, First" pattern
      const joined = line.replace(/^"\d+",?/, ""); // strip row number
      const quotedMatch = joined.match(/^"([^"]+)"\s*[,\t]\s*(\d{4})\s*[,\t]\s*(\w+)/);
      if (quotedMatch) {
        const nameParts = quotedMatch[1].split(",").map((s) => s.trim());
        entry = {
          last_name: nameParts[0] || "",
          first_name: (nameParts[1] || "").split(/\s+/)[0], // strip middle initial
          student_id: quotedMatch[2],
          grade: normalizeGrade(quotedMatch[3]),
        };
        // Try to grab DOB
        const dobMatch = joined.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (dobMatch) entry.dob = dobMatch[1];
      }

      // Format: ID, First, Last, Grade  or  First, Last, ID, Grade
      if (!entry && cols.length >= 3) {
        if (/^\d{4}$/.test(cols[0])) {
          entry = {
            student_id: cols[0],
            first_name: cols[1],
            last_name: cols[2],
            grade: cols[3] ? normalizeGrade(cols[3]) : defaultGrade,
          };
        } else if (/^\d{4}$/.test(cols[2])) {
          entry = {
            first_name: cols[0],
            last_name: cols[1],
            student_id: cols[2],
            grade: cols[3] ? normalizeGrade(cols[3]) : defaultGrade,
          };
        } else if (cols[0].includes(" ") || (cols.length >= 2 && /^\d{4}$/.test(cols[1]))) {
          // "Last First" ID format or similar
          if (/^\d{4}$/.test(cols[1])) {
            const names = cols[0].split(/\s+/);
            entry = {
              first_name: names[0],
              last_name: names.slice(1).join(" ") || names[0],
              student_id: cols[1],
              grade: cols[2] ? normalizeGrade(cols[2]) : defaultGrade,
            };
          }
        }
      }

      if (entry && entry.student_id) {
        entry.school_year = schoolYear;
        entry.grade = entry.grade || defaultGrade;
        entry.teacher = defaultTeacher;
        entry.class_id = defaultClassId || `${entry.grade}A`;
        entries.push(entry);
      }
    }
    return entries;
  }

  function normalizeGrade(g) {
    if (!g) return defaultGrade;
    g = g.trim().toUpperCase();
    if (g === "KG" || g === "K") return "K";
    if (g === "PS" || g === "PK" || g === "TK") return g; // preschool/TK — keep as-is
    const n = parseInt(g);
    if (!isNaN(n) && n >= 0 && n <= 8) return String(n);
    return g;
  }

  function handleParse() {
    const entries = parseRoster(pasteText);
    setPreview(entries);
    if (entries.length === 0) {
      setMessage("No valid student entries found. Expected format: Name, ID, Grade (one per line).");
    } else {
      setMessage(`Found ${entries.length} students. Review below and click Import.`);
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPasteText(ev.target.result);
      const entries = parseRoster(ev.target.result);
      setPreview(entries);
      setMessage(`Loaded ${file.name}: ${entries.length} students found.`);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (preview.length === 0) return;
    const result = await addStudentsBatch(preview);
    const parts = [];
    if (result.added.length) parts.push(`${result.added.length} added`);
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped (already exist)`);
    if (result.errors.length) parts.push(`${result.errors.length} errors`);
    setMessage(parts.join(", "));
    setPreview([]);
    setPasteText("");
  }

  async function handleAddSingle() {
    if (!singleId || !singleFirst || !singleLast) {
      setMessage("Student ID, first name, and last name are required.");
      return;
    }
    if (!/^\d{4}$/.test(singleId)) {
      setMessage("Student ID must be a 4-digit number.");
      return;
    }
    try {
      await addStudent(
        {
          student_id: singleId,
          first_name: singleFirst,
          last_name: singleLast,
          dob: singleDob,
        },
        {
          school_year: schoolYear,
          grade: singleGrade,
          teacher: defaultTeacher,
          class_id: defaultClassId || `${singleGrade}A`,
        }
      );
      setMessage(`Added ${singleFirst} ${singleLast} (${singleId})`);
      setSingleId("");
      setSingleFirst("");
      setSingleLast("");
      setSingleDob("");
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="panel">
      <h3>Add Students</h3>
      <p className="panel-desc">
        Import a roster (CSV or paste) or add individual students. New students are added to the Students tab and enrolled for the specified year.
      </p>

      <div className="filters" style={{ marginBottom: 12 }}>
        <label>School Year:</label>
        <input
          type="text" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}
          placeholder="2026-2027"
          style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 100 }}
        />
        <label>Default Grade:</label>
        <select value={defaultGrade} onChange={(e) => setDefaultGrade(e.target.value)}>
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
        <label>Teacher:</label>
        <input
          type="text" value={defaultTeacher} onChange={(e) => setDefaultTeacher(e.target.value)}
          placeholder="Last name"
          style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 120 }}
        />
        <label>Class:</label>
        <input
          type="text" value={defaultClassId} onChange={(e) => setDefaultClassId(e.target.value)}
          placeholder="e.g. KA"
          style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 70 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`btn-small ${mode === "paste" ? "btn-active" : ""}`} onClick={() => setMode("paste")}>
          Paste Roster
        </button>
        <button className={`btn-small ${mode === "csv" ? "btn-active" : ""}`} onClick={() => setMode("csv")}>
          Upload CSV
        </button>
        <button className={`btn-small ${mode === "single" ? "btn-active" : ""}`} onClick={() => setMode("single")}>
          Add One Student
        </button>
      </div>

      {message && <p className="panel-message">{message}</p>}

      {mode === "paste" && (
        <div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Paste roster here. Accepted formats:\n"Last, First", 1234, K, Female, 01/23/2020\nFirst Last, 1234, K\n1234, First, Last, K'}
            style={{
              width: "100%", minHeight: 120, padding: 10, fontFamily: "var(--mono)",
              fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn-primary" onClick={handleParse} disabled={!pasteText.trim()}>
              Parse
            </button>
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div>
          <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} />
        </div>
      )}

      {mode === "single" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b" }}>Student ID *</label>
            <input className="id-input" value={singleId} onChange={(e) => setSingleId(e.target.value)}
              maxLength={4} placeholder="0000" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b" }}>First Name *</label>
            <input className="field-input" value={singleFirst} onChange={(e) => setSingleFirst(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b" }}>Last Name *</label>
            <input className="field-input" value={singleLast} onChange={(e) => setSingleLast(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b" }}>DOB</label>
            <input className="field-input" value={singleDob} onChange={(e) => setSingleDob(e.target.value)}
              placeholder="MM/DD/YYYY" style={{ width: 100 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b" }}>Grade</label>
            <select value={singleGrade} onChange={(e) => setSingleGrade(e.target.value)}
              style={{ padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 13 }}>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={handleAddSingle}>Add</button>
        </div>
      )}

      {/* Preview table for batch import */}
      {preview.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <table className="enroll-table">
            <thead>
              <tr>
                <th>ID</th><th>First Name</th><th>Last Name</th>
                <th>Grade</th><th>DOB</th><th>Year</th><th>Class</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i}>
                  <td className="mono">{p.student_id}</td>
                  <td>{p.first_name}</td>
                  <td>{p.last_name}</td>
                  <td>{p.grade}</td>
                  <td>{p.dob || "—"}</td>
                  <td>{p.school_year}</td>
                  <td>{p.class_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary" onClick={handleImport} style={{ marginTop: 8 }}>
            Import {preview.length} Students
          </button>
        </div>
      )}
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
      <AddStudentsPanel />
      <IdResolutionPanel />
      <EnrollmentEditor />
      <YearRollover />
      <ExportPanel />
    </div>
  );
}
