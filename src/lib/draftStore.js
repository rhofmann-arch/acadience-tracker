/**
 * Draft store — saves in-progress assessment entries to localStorage.
 *
 * Drafts are keyed by student_id + school_year + period so an assessor
 * can pause and resume data entry across sessions.
 */

const STORAGE_KEY = "acadience_drafts";

function _loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _saveAll(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function _key(studentId, schoolYear, period) {
  return `${studentId}|${schoolYear}|${period}`;
}

/**
 * Save a draft score entry. Merges with existing draft if present.
 */
export function saveDraft(studentId, schoolYear, period, scores) {
  const drafts = _loadAll();
  const key = _key(studentId, schoolYear, period);
  drafts[key] = {
    student_id: studentId,
    school_year: schoolYear,
    period,
    scores,
    updated_at: new Date().toISOString(),
  };
  _saveAll(drafts);
}

/**
 * Load a draft for a specific student/year/period.
 * Returns the scores object or null.
 */
export function loadDraft(studentId, schoolYear, period) {
  const drafts = _loadAll();
  return drafts[_key(studentId, schoolYear, period)] || null;
}

/**
 * Delete a draft (e.g., after successful submission).
 */
export function deleteDraft(studentId, schoolYear, period) {
  const drafts = _loadAll();
  delete drafts[_key(studentId, schoolYear, period)];
  _saveAll(drafts);
}

/**
 * List all drafts, optionally filtered by school year and period.
 * Returns array of draft objects sorted by updated_at descending.
 */
export function listDrafts(schoolYear, period) {
  const drafts = _loadAll();
  let list = Object.values(drafts);

  if (schoolYear) {
    list = list.filter((d) => d.school_year === schoolYear);
  }
  if (period) {
    list = list.filter((d) => d.period === period);
  }

  return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/**
 * Count pending drafts.
 */
export function draftCount() {
  return Object.keys(_loadAll()).length;
}
