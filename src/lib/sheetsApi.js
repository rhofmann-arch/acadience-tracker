/**
 * Google Sheets API service.
 *
 * Handles OAuth (Google Identity Services, implicit/token flow) and
 * read/write operations against the Acadience Reading Data spreadsheet.
 *
 * Usage:
 *   import { initAuth, signIn, signOut, isSignedIn, readTab, appendRows, ... } from './sheetsApi';
 *   await initAuth();          // load GIS, set up token client
 *   await signIn();            // prompt user to authorize
 *   const rows = await readTab("Scores");
 */

// ---------------------------------------------------------------------------
// Configuration — update these after creating the Web App OAuth client
// ---------------------------------------------------------------------------
const CONFIG = {
  CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
  SPREADSHEET_ID: import.meta.env.VITE_SPREADSHEET_ID || "1vr2_U_C2kpTgK29bS49KZar5FiyY1YG6Xh729GmsmhI",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  API_BASE: "https://sheets.googleapis.com/v4/spreadsheets",
};

let _tokenClient = null;
let _accessToken = null;
let _authListeners = [];

// ---------------------------------------------------------------------------
// Script loading
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Initialize the Google Identity Services token client.
 * Must be called once before signIn().
 */
export async function initAuth() {
  if (!CONFIG.CLIENT_ID) {
    console.warn("sheetsApi: No VITE_GOOGLE_CLIENT_ID set. Sheets integration disabled.");
    return false;
  }

  await loadScript("https://accounts.google.com/gsi/client");

  return new Promise((resolve) => {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: (response) => {
        if (response.access_token) {
          _accessToken = response.access_token;
          _notifyAuthListeners();
        }
      },
    });
    resolve(true);
  });
}

/**
 * Prompt the user to sign in (shows Google consent screen).
 */
export function signIn() {
  if (!_tokenClient) {
    console.error("sheetsApi: initAuth() not called yet");
    return;
  }
  _tokenClient.requestAccessToken();
}

/**
 * Sign out / revoke the current token.
 */
export function signOut() {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken);
    _accessToken = null;
    _notifyAuthListeners();
  }
}

export function isSignedIn() {
  return !!_accessToken;
}

export function onAuthChange(fn) {
  _authListeners.push(fn);
  return () => {
    _authListeners = _authListeners.filter((l) => l !== fn);
  };
}

function _notifyAuthListeners() {
  _authListeners.forEach((fn) => fn(isSignedIn()));
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function _fetch(path, options = {}) {
  if (!_accessToken) throw new Error("Not signed in");

  const url = `${CONFIG.API_BASE}/${CONFIG.SPREADSHEET_ID}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${_accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    _accessToken = null;
    _notifyAuthListeners();
    throw new Error("Session expired — please sign in again");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Read all rows from a tab. Returns array of objects keyed by header row.
 */
export async function readTab(tabName) {
  const data = await _fetch(`/values/${encodeURIComponent(tabName)}`);
  if (!data.values || data.values.length < 2) return [];

  const headers = data.values[0];
  return data.values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

/**
 * Read all tabs. Fetches each tab individually to avoid response size
 * limits with batchGet on large tabs (Scores has 2000+ rows).
 */
export async function readAllTabs() {
  const tabs = ["Students", "Enrollment", "Scores", "BenchmarkRef", "Diagnostics", "Iowa"];
  const result = {};

  for (const tabName of tabs) {
    const rows = await readTab(tabName);
    result[tabName] = rows;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Append rows to a tab. `rows` is an array of objects matching the tab's headers.
 * Headers are read first to ensure correct column ordering.
 */
export async function appendRows(tabName, rows) {
  if (!rows.length) return;

  // Get headers
  const headerData = await _fetch(`/values/${encodeURIComponent(tabName)}!1:1`);
  const headers = headerData.values?.[0];
  if (!headers) throw new Error(`Tab "${tabName}" has no header row`);

  // Convert objects to arrays in header order
  const values = rows.map((row) =>
    headers.map((h) => {
      const v = row[h];
      return v == null ? "" : String(v);
    })
  );

  await _fetch(`/values/${encodeURIComponent(tabName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values }),
  });

  return values.length;
}

/**
 * Update a specific range (e.g., a single row).
 * `range` is A1 notation like "Students!A5:G5".
 */
export async function updateRange(range, values) {
  await _fetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

/**
 * Find a row by matching one or more column values, then update it.
 *
 * `keys` is an object of { columnName: value } to match on.
 * All keys must match for a row to be selected.
 *
 * Example: updateRowByKeys("Enrollment",
 *   { student_id: "2870", school_year: "2025-2026" },
 *   { teacher: "Smith" })
 */
export async function updateRowByKeys(tabName, keys, updates) {
  const data = await _fetch(`/values/${encodeURIComponent(tabName)}`);
  if (!data.values || data.values.length < 2) {
    throw new Error(`Tab "${tabName}" is empty`);
  }

  const headers = data.values[0];

  // Resolve key column indices
  const keyEntries = Object.entries(keys).map(([col, val]) => {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" not found in ${tabName}`);
    return { idx, val: String(val) };
  });

  // Find the matching row
  const rowIdx = data.values.findIndex((row, i) => {
    if (i === 0) return false; // skip header
    return keyEntries.every(({ idx, val }) => row[idx] === val);
  });

  if (rowIdx === -1) {
    const keyDesc = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join(", ");
    throw new Error(`No row matching ${keyDesc} in ${tabName}`);
  }

  const rowNum = rowIdx + 1; // Sheets is 1-indexed
  const updatedRow = [...data.values[rowIdx]];
  for (const [key, val] of Object.entries(updates)) {
    const colIdx = headers.indexOf(key);
    if (colIdx !== -1) {
      updatedRow[colIdx] = val == null ? "" : String(val);
    }
  }

  const lastCol = String.fromCharCode(64 + headers.length);
  const range = `${tabName}!A${rowNum}:${lastCol}${rowNum}`;
  await updateRange(range, [updatedRow]);
}

// Backwards-compatible single-key version
export async function updateRowByKey(tabName, keyColumn, keyValue, updates) {
  return updateRowByKeys(tabName, { [keyColumn]: keyValue }, updates);
}

/**
 * Write a complete score row to the Scores tab.
 * Calculates composite if not provided.
 */
export async function writeScore(scoreData) {
  return appendRows("Scores", [scoreData]);
}

/**
 * Batch write multiple score rows.
 */
export async function writeScores(scoreRows) {
  return appendRows("Scores", scoreRows);
}

export { CONFIG };
