import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import ClassroomSnapshot from "./pages/ClassroomSnapshot";
import StudentProfile from "./pages/StudentProfile";
import SchoolSummary from "./pages/SchoolSummary";
import EnrollmentManager from "./pages/EnrollmentManager";
import AssessmentManager from "./pages/AssessmentManager";
import { initAuth, signIn, signOut, isSignedIn, onAuthChange } from "./lib/sheetsApi";
import { isLoading, isSheetsMode, subscribe } from "./lib/dataService";
import "./App.css";

function App() {
  const [authed, setAuthed] = useState(isSignedIn());
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheetsMode, setSheetsMode] = useState(false);

  useEffect(() => {
    initAuth().then((ok) => setAuthReady(!!ok));
    const unsubAuth = onAuthChange((signed) => setAuthed(signed));
    const unsubData = subscribe(() => {
      setLoading(isLoading());
      setSheetsMode(isSheetsMode());
    });
    return () => { unsubAuth(); unsubData(); };
  }, []);

  return (
    <BrowserRouter basename="/acadience-tracker">
      <div className="app">
        <header className="app-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1>Acadience Reading Tracker</h1>
              <p className="app-subtitle">Baymonte Christian School</p>
            </div>
            <div className="auth-controls">
              {authReady && authed ? (
                <>
                  <span className="auth-status connected">
                    {loading ? "Loading from Sheets..." : sheetsMode ? "Live — Google Sheets" : "Connected"}
                  </span>
                  <button className="btn-small" onClick={signOut}>Sign Out</button>
                </>
              ) : authReady ? (
                <>
                  <span className="auth-status" style={{ color: "#94a3b8" }}>Offline — using imported data</span>
                  <button className="btn-primary" onClick={signIn}>
                    Connect Google Sheets
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <nav className="app-nav">
            <NavLink to="/" end>
              Classroom Snapshot
            </NavLink>
            <NavLink to="/student">Student Profile</NavLink>
            <NavLink to="/summary">School Summary</NavLink>
            <NavLink to="/assess">Assess</NavLink>
            <NavLink to="/manage">Enrollment</NavLink>
          </nav>
        </header>
        {loading && (
          <div className="loading-bar">Loading data from Google Sheets...</div>
        )}
        <main className="app-main">
          <Routes>
            <Route path="/" element={<ClassroomSnapshot />} />
            <Route path="/student" element={<StudentProfile />} />
            <Route path="/student/:studentId" element={<StudentProfile />} />
            <Route path="/summary" element={<SchoolSummary />} />
            <Route path="/assess" element={<AssessmentManager />} />
            <Route path="/manage" element={<EnrollmentManager />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
