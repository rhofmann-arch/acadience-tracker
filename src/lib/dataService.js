/**
 * Data service — provides access to student, enrollment, and score data.
 *
 * When connected to Google Sheets (via sheetsApi), reads/writes live data.
 * Falls back to the static JSON import when offline.
 */

import importData from "../data/importData.json";
import {
  isSignedIn,
  readAllTabs,
  appendRows,
  updateRowByKey,
  updateRowByKeys,
  onAuthChange,
} from "./sheetsApi";
import { calculateComposite } from "./scoringEngine";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let _students = [...importData.students];
let _enrollment = [...importData.enrollment];
let _scores = [...importData.scores];
let _diagnostics = [];
let _iowa = [];
let _capti = [];
let _sheetsMode = false; // true when live-connected to Google Sheets
let _loading = false;

let _studentMap = new Map(_students.map((s) => [s.student_id, s]));

function _rebuildIndex() {
  _studentMap = new Map(_students.map((s) => [s.student_id, s]));
}

// Change listeners for reactive UI updates
let _listeners = [];
export function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
function _notify() {
  _listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Google Sheets sync
// ---------------------------------------------------------------------------

/**
 * Load data from Google Sheets. Called when auth state changes to signed-in.
 */
export async function loadFromSheets() {
  if (!isSignedIn()) return;
  _loading = true;
  _notify();

  try {
    const tabs = await readAllTabs();

    // Parse Students
    _students = (tabs.Students || []).map((row) => ({
      student_id: row.student_id || "",
      last_name: row.last_name || "",
      first_name: row.first_name || "",
      preferred_name: row.preferred_name || "",
      dob: row.dob || "",
      cohort_year: row.cohort_year || "",
      active: row.active || "TRUE",
    }));

    // Parse Enrollment
    _enrollment = (tabs.Enrollment || []).map((row) => ({
      student_id: row.student_id || "",
      school_year: row.school_year || "",
      grade: row.grade || "",
      teacher: row.teacher || "",
      class_id: row.class_id || "",
    }));

    // Parse Scores — convert numeric fields
    const numericFields = [
      "composite", "lnf", "fsf", "psf", "nwf_cls", "nwf_wwr",
      "orf_words", "orf_accuracy", "orf_errors", "retell", "retell_quality",
      "maze", "wrf_historical", "mclass_composite",
    ];

    _scores = (tabs.Scores || []).map((row) => {
      const score = { ...row };
      for (const field of numericFields) {
        const v = score[field];
        if (v === "" || v == null) {
          score[field] = null;
        } else {
          const n = Number(v);
          score[field] = isNaN(n) ? null : n;
        }
      }
      return score;
    });

    // Parse Diagnostics
    _diagnostics = (tabs.Diagnostics || []).map((row) => ({
      student_id: row.student_id || "",
      test_name: row.test_name || "",
      assessor: row.assessor || "",
      assessment_date: row.assessment_date || "",
      findings: row.findings || "",
      notes: row.notes || "",
    }));

    // Parse Iowa scores
    const iowaNumeric = [
      "reading_npr", "language_npr", "vocabulary_npr", "ela_total_npr",
      "word_analysis_npr", "listening_npr", "extended_ela_npr",
      "written_expression_npr", "conventions_npr",
    ];
    _iowa = (tabs.Iowa || []).map((row) => {
      const rec = { ...row };
      for (const field of iowaNumeric) {
        const v = rec[field];
        if (v === "" || v == null) rec[field] = null;
        else { const n = Number(v); rec[field] = isNaN(n) ? null : n; }
      }
      return rec;
    });

    // Parse Capti ReadBasix scores
    const captiNumeric = [
      "word_recognition", "vocabulary", "morphology",
      "sentence_processing", "reading_efficiency", "reading_comprehension",
    ];
    _capti = (tabs.Capti || []).map((row) => {
      const rec = { ...row };
      for (const field of captiNumeric) {
        const v = rec[field];
        if (v === "" || v == null) rec[field] = null;
        else { const n = Number(v); rec[field] = isNaN(n) ? null : n; }
      }
      return rec;
    });

    _sheetsMode = true;
    _rebuildIndex();

    // Log counts for debugging
    const scoreCounts = {};
    for (const s of _scores) {
      const key = `${s.school_year} G${s.grade} ${s.period}`;
      scoreCounts[key] = (scoreCounts[key] || 0) + 1;
    }
    console.log(
      `Loaded from Sheets: ${_students.length} students, ${_enrollment.length} enrollment, ${_scores.length} scores`
    );
    console.log("Score breakdown:", scoreCounts);
  } catch (err) {
    console.error("Failed to load from Sheets:", err);
    // Keep existing data (static JSON fallback)
  } finally {
    _loading = false;
    _notify();
  }
}

// Auto-load when auth state changes
onAuthChange((signedIn) => {
  if (signedIn) {
    loadFromSheets();
  } else {
    // Revert to static JSON
    _students = [...importData.students];
    _enrollment = [...importData.enrollment];
    _scores = [...importData.scores];
    _diagnostics = [];
    _iowa = [];
    _capti = [];
    _sheetsMode = false;
    _rebuildIndex();
    _notify();
  }
});

export function isSheetsMode() {
  return _sheetsMode;
}

export function isLoading() {
  return _loading;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function getAllStudents() {
  return _students;
}

export function getStudent(studentId) {
  return _studentMap.get(studentId) || null;
}

export function getSchoolYears() {
  const years = new Set(_scores.map((s) => s.school_year));
  return [...years].sort().reverse();
}

export function getPeriodsForYear(schoolYear) {
  const periods = new Set(
    _scores.filter((s) => s.school_year === schoolYear).map((s) => s.period)
  );
  // Also include periods from Capti data
  for (const c of _capti) {
    if (c.school_year === schoolYear && c.period) periods.add(c.period);
  }
  const order = ["BOY", "MOY", "EOY"];
  return order.filter((p) => periods.has(p));
}

export function getEnrollmentForYear(schoolYear) {
  return _enrollment
    .filter((e) => e.school_year === schoolYear)
    .map((e) => ({
      ...e,
      student: _studentMap.get(e.student_id),
    }));
}

export function getClassesForYear(schoolYear) {
  const classes = new Map();
  for (const e of _enrollment) {
    if (e.school_year !== schoolYear) continue;
    if (!e.class_id && !e.teacher) continue; // skip empty placeholders
    const key = e.class_id || `${e.grade}-${e.teacher}`;
    if (!classes.has(key)) {
      classes.set(key, {
        class_id: e.class_id,
        teacher: e.teacher,
        grade: e.grade,
      });
    }
  }
  return [...classes.values()].sort((a, b) => {
    const gradeOrder = ["K", "1", "2", "3", "4", "5", "6", "7", "8"];
    return gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade);
  });
}

export function getClassScores(schoolYear, classId, period) {
  const classStudents = _enrollment.filter(
    (e) => e.school_year === schoolYear && e.class_id === classId
  );

  return classStudents
    .map((enrollment) => {
      const student = _studentMap.get(enrollment.student_id);
      const score = _scores.find(
        (s) =>
          s.student_id === enrollment.student_id &&
          s.school_year === schoolYear &&
          s.period === period &&
          s.assessment_type !== "progress_monitoring"
      );
      return { student, enrollment, score: score || null };
    })
    .filter((r) => r.student)
    .sort((a, b) =>
      (a.student.last_name || "").localeCompare(b.student.last_name || "")
    );
}

/**
 * Get all periods' scores for a class in a year.
 * Returns array of { student, scores: { BOY, MOY, EOY } }.
 */
export function getClassGrowthData(schoolYear, classId) {
  const classStudents = _enrollment.filter(
    (e) => e.school_year === schoolYear && e.class_id === classId
  );

  return classStudents
    .map((enrollment) => {
      const student = _studentMap.get(enrollment.student_id);
      const scores = {};
      for (const period of ["BOY", "MOY", "EOY"]) {
        scores[period] = _scores.find(
          (s) =>
            s.student_id === enrollment.student_id &&
            s.school_year === schoolYear &&
            s.period === period &&
            s.assessment_type !== "progress_monitoring"
        ) || null;
      }
      return { student, scores };
    })
    .filter((r) => r.student);
}

export function getStudentHistory(studentId) {
  return _scores
    .filter((s) => s.student_id === studentId && s.assessment_type !== "progress_monitoring")
    .sort((a, b) => {
      if (a.school_year !== b.school_year)
        return a.school_year.localeCompare(b.school_year);
      const order = { BOY: 0, MOY: 1, EOY: 2 };
      return (order[a.period] || 0) - (order[b.period] || 0);
    });
}

/**
 * Get progress monitoring scores for a student, sorted by date.
 */
export function getStudentPMScores(studentId) {
  return _scores
    .filter((s) => s.student_id === studentId && s.assessment_type === "progress_monitoring")
    .sort((a, b) => (a.assessment_date || "").localeCompare(b.assessment_date || ""));
}

/**
 * Get diagnostic records for a student, sorted by date.
 */
export function getDiagnostics(studentId) {
  return _diagnostics
    .filter((d) => d.student_id === studentId)
    .sort((a, b) => (b.assessment_date || "").localeCompare(a.assessment_date || ""));
}

/**
 * Get Iowa Assessment scores for a student, sorted by school year.
 */
export function getIowaScores(studentId) {
  return _iowa
    .filter((r) => r.student_id === studentId)
    .sort((a, b) => (a.school_year || "").localeCompare(b.school_year || ""));
}

/**
 * Get Capti ReadBasix scores for a student, sorted by school year then period.
 */
export function getCaptiScores(studentId) {
  const order = { BOY: 0, MOY: 1, EOY: 2 };
  return _capti
    .filter((r) => r.student_id === studentId)
    .sort((a, b) => {
      if (a.school_year !== b.school_year)
        return (a.school_year || "").localeCompare(b.school_year || "");
      return (order[a.period] || 0) - (order[b.period] || 0);
    });
}

/**
 * Get Capti ReadBasix scores for a class in a given year/period.
 * Matches via enrollment.
 */
export function getCaptiClassScores(schoolYear, classId, period) {
  const classStudents = _enrollment.filter(
    (e) => e.school_year === schoolYear && e.class_id === classId
  );

  return classStudents
    .map((enrollment) => {
      const student = _studentMap.get(enrollment.student_id);
      const score = _capti.find(
        (s) =>
          s.student_id === enrollment.student_id &&
          s.school_year === schoolYear &&
          s.period === period
      );
      return { student, enrollment, score: score || null };
    })
    .filter((r) => r.student)
    .sort((a, b) =>
      (a.student.last_name || "").localeCompare(b.student.last_name || "")
    );
}

/**
 * Add a diagnostic record for a student.
 */
export async function addDiagnostic(data) {
  const record = {
    student_id: data.student_id || "",
    test_name: data.test_name || "",
    assessor: data.assessor || "",
    assessment_date: data.assessment_date || "",
    findings: data.findings || "",
    notes: data.notes || "",
  };

  _diagnostics.push(record);
  _notify();

  if (_sheetsMode) {
    try {
      await appendRows("Diagnostics", [record]);
    } catch (err) {
      console.error("Failed to write diagnostic to Sheets:", err);
      throw err;
    }
  }

  return record;
}

export function getSchoolWideScores(schoolYear, period) {
  const byGrade = {};
  const gradeScores = _scores.filter(
    (s) => s.school_year === schoolYear && s.period === period && s.assessment_type !== "progress_monitoring"
  );
  for (const score of gradeScores) {
    if (!byGrade[score.grade]) byGrade[score.grade] = [];
    byGrade[score.grade].push({
      ...score,
      student: _studentMap.get(score.student_id),
    });
  }
  return byGrade;
}

export function searchStudents(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return _students
    .filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.student_id.includes(q)
    )
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Write operations — update local state AND persist to Sheets if connected
// ---------------------------------------------------------------------------

/**
 * Update a student's SIS ID. Propagates to all enrollment and score rows.
 */
export async function updateStudentId(oldId, newId) {
  if (!newId || newId === oldId) return;
  if (_studentMap.has(newId)) {
    throw new Error(`Student ID ${newId} already exists`);
  }

  // Update local state
  const student = _studentMap.get(oldId);
  if (student) student.student_id = newId;
  for (const e of _enrollment) {
    if (e.student_id === oldId) e.student_id = newId;
  }
  for (const s of _scores) {
    if (s.student_id === oldId) s.student_id = newId;
  }
  _rebuildIndex();
  _notify();

  // Persist to Sheets if connected
  if (_sheetsMode) {
    try {
      await updateRowByKey("Students", "student_id", oldId, { student_id: newId });
      // Enrollment and Scores have many rows — reload is more practical
      // than updating each individually. For now, local state is updated.
    } catch (err) {
      console.error("Failed to persist ID change to Sheets:", err);
    }
  }
}

/**
 * Update enrollment fields for a student in a given year.
 */
export async function updateEnrollment(studentId, schoolYear, updates) {
  const record = _enrollment.find(
    (e) => e.student_id === studentId && e.school_year === schoolYear
  );
  if (record) {
    Object.assign(record, updates);
    _notify();

    if (_sheetsMode) {
      try {
        await updateRowByKeys("Enrollment",
          { student_id: studentId, school_year: schoolYear },
          updates
        );
      } catch (err) {
        console.error("Failed to persist enrollment change:", err);
      }
    }
  }
}

/**
 * Get students needing ID resolution (non-numeric IDs).
 */
export function getStudentsNeedingIds() {
  return _students.filter((s) => !s.student_id.match(/^\d{4}$/));
}

/**
 * Roll students forward to a new school year.
 */
export async function rolloverYear(fromYear, toYear, assignments) {
  const GRADE_NEXT = {
    K: "1", 1: "2", 2: "3", 3: "4", 4: "5", 5: "6", 6: "7", 7: "8",
  };

  const fromEnrollment = _enrollment.filter((e) => e.school_year === fromYear);
  const newRows = [];

  for (const e of fromEnrollment) {
    const exists = _enrollment.find(
      (x) => x.student_id === e.student_id && x.school_year === toYear
    );
    if (exists) continue;

    const nextGrade = GRADE_NEXT[e.grade];
    if (!nextGrade) continue;

    const assignment = assignments?.[e.student_id] || {};
    const newRecord = {
      student_id: e.student_id,
      school_year: toYear,
      grade: nextGrade,
      teacher: assignment.teacher || "",
      class_id: assignment.class_id || `${nextGrade}A`,
    };
    _enrollment.push(newRecord);
    newRows.push(newRecord);
  }

  _notify();

  // Persist new enrollment rows to Sheets
  if (_sheetsMode && newRows.length) {
    try {
      await appendRows("Enrollment", newRows);
    } catch (err) {
      console.error("Failed to persist rollover to Sheets:", err);
    }
  }

  return newRows.length;
}

/**
 * Set a student's active status.
 */
/**
 * Add a new student and enroll them for a school year.
 * Returns the student record, or throws if ID already exists.
 */
export async function addStudent(studentData, enrollmentData) {
  const { student_id } = studentData;
  if (_studentMap.has(student_id)) {
    throw new Error(`Student ID ${student_id} already exists`);
  }

  const student = {
    student_id,
    last_name: studentData.last_name || "",
    first_name: studentData.first_name || "",
    preferred_name: studentData.preferred_name || "",
    dob: studentData.dob || "",
    cohort_year: studentData.cohort_year || "",
    active: "TRUE",
  };

  _students.push(student);
  _rebuildIndex();

  if (enrollmentData) {
    const enrollment = {
      student_id,
      school_year: enrollmentData.school_year || "",
      grade: enrollmentData.grade || "",
      teacher: enrollmentData.teacher || "",
      class_id: enrollmentData.class_id || "",
    };
    _enrollment.push(enrollment);

    if (_sheetsMode) {
      try {
        await appendRows("Students", [student]);
        await appendRows("Enrollment", [enrollment]);
      } catch (err) {
        console.error("Failed to persist new student to Sheets:", err);
        throw err;
      }
    }
  } else {
    if (_sheetsMode) {
      try {
        await appendRows("Students", [student]);
      } catch (err) {
        console.error("Failed to persist new student to Sheets:", err);
        throw err;
      }
    }
  }

  _notify();
  return student;
}

/**
 * Add multiple students and enrollments in batch.
 * Returns { added, skipped, errors }.
 */
export async function addStudentsBatch(entries) {
  const added = [];
  const skipped = [];
  const errors = [];
  const newStudents = [];
  const newEnrollments = [];

  for (const entry of entries) {
    const { student_id } = entry;
    if (!student_id) {
      errors.push({ ...entry, reason: "Missing student ID" });
      continue;
    }
    if (_studentMap.has(student_id)) {
      skipped.push({ ...entry, reason: "ID already exists" });
      continue;
    }

    const student = {
      student_id,
      last_name: entry.last_name || "",
      first_name: entry.first_name || "",
      preferred_name: entry.preferred_name || "",
      dob: entry.dob || "",
      cohort_year: entry.cohort_year || "",
      active: "TRUE",
    };
    _students.push(student);
    newStudents.push(student);

    if (entry.school_year && entry.grade) {
      const enrollment = {
        student_id,
        school_year: entry.school_year,
        grade: entry.grade,
        teacher: entry.teacher || "",
        class_id: entry.class_id || "",
      };
      _enrollment.push(enrollment);
      newEnrollments.push(enrollment);
    }

    added.push(student);
  }

  _rebuildIndex();

  if (_sheetsMode) {
    try {
      if (newStudents.length) await appendRows("Students", newStudents);
      if (newEnrollments.length) await appendRows("Enrollment", newEnrollments);
    } catch (err) {
      console.error("Failed to persist batch to Sheets:", err);
    }
  }

  _notify();
  return { added, skipped, errors };
}

export async function setStudentActive(studentId, active) {
  const student = _studentMap.get(studentId);
  if (student) {
    student.active = active ? "TRUE" : "FALSE";
    _notify();

    if (_sheetsMode) {
      try {
        await updateRowByKey("Students", "student_id", studentId, {
          active: student.active,
        });
      } catch (err) {
        console.error("Failed to persist active status:", err);
      }
    }
  }
}

/**
 * Submit a new score row (from Assessment Manager).
 * Calculates composite, writes to local state AND Sheets.
 */
export async function submitScore(scoreData) {
  // Calculate composite from sub-scores
  const composite = calculateComposite(scoreData.grade, scoreData.period, scoreData);
  const row = {
    ...scoreData,
    composite: composite != null ? composite : "",
    data_source: scoreData.data_source || "Acadience",
    assessment_type: scoreData.assessment_type || "benchmark",
  };

  // Add to local state
  _scores.push(row);
  _notify();

  // Persist to Sheets
  if (_sheetsMode) {
    try {
      await appendRows("Scores", [row]);
    } catch (err) {
      console.error("Failed to write score to Sheets:", err);
      throw err; // Re-throw so UI can show error
    }
  }

  return row;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportData() {
  return { students: _students, enrollment: _enrollment, scores: _scores, diagnostics: _diagnostics, capti: _capti };
}

export function exportCsv(dataset) {
  const data =
    dataset === "students" ? _students
    : dataset === "enrollment" ? _enrollment
    : _scores;
  if (!data.length) return "";
  const keys = Object.keys(data[0]);
  const rows = [keys.join(",")];
  for (const row of data) {
    rows.push(
      keys
        .map((k) => {
          const v = row[k];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    );
  }
  return rows.join("\n");
}
