import { useState } from "react";
import { ON_TRACK_TRAJECTORY, ON_TRACK_START, ON_TRACK_END, GRADE_EOY_GOAL, getActualScores } from "../lib/trajectory";
import { generateFluencyReport } from "../lib/pdfReports";

// ---------------------------------------------------------------------------
// Layout constants (SVG viewBox units — the <svg> scales responsively)
// ---------------------------------------------------------------------------
const VIEW_W = 720;
const VIEW_H = 300;
const MARGIN = { top: 34, right: 72, bottom: 30, left: 34 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;
const Y_TICKS = [0, 20, 40, 60, 80, 100];

const GOAL_COLOR = "#64748b"; // slate — a reference/target line, not a status color
const ACTUAL_COLOR = "#2563eb"; // blue — a student's real score (matches Comprehension Tracker)
const SUMMER_FILL = "#ef9f2717";
const SUMMER_INK = "#b3760f";

function xFor(i, n) {
  return MARGIN.left + (i / (n - 1)) * PLOT_W;
}

/**
 * Chart showing Baymonte's on-track ORF fluency trajectory — 15 cwpm at
 * Grade 1 BOY, holding flat over each summer, up to 100 cwpm at Grade 4 EOY —
 * with the student's actual ORF score overlaid as a solid line wherever
 * they have data for it.
 */
export default function FluencyTrajectoryChart({ student, history, captiScores, iowaScores }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const points = ON_TRACK_TRAJECTORY;
  const n = points.length;
  const actual = getActualScores(points, history || []);
  const hasActual = actual.some((v) => v != null);

  const yMax = Math.max(110, ...actual.filter((v) => v != null).map((v) => Math.ceil((v + 10) / 10) * 10));
  const yFor = (value) => MARGIN.top + (1 - value / yMax) * PLOT_H;

  const goalPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i, n).toFixed(1)} ${yFor(p.goalCwpm).toFixed(1)}`)
    .join(" ");

  // Break the actual-score line across gaps where a period has no data —
  // only connect two points that are genuinely adjacent periods, so a
  // missing administration (or years before enrollment) doesn't get bridged
  // by a line implying interpolated data that was never collected.
  let actualPath = "";
  let prevActualIndex = null;
  actual.forEach((v, i) => {
    if (v == null) return;
    const contiguous = prevActualIndex != null && i === prevActualIndex + 1;
    actualPath += `${contiguous ? "L" : "M"} ${xFor(i, n).toFixed(1)} ${yFor(v).toFixed(1)} `;
    prevActualIndex = i;
  });

  const summerSpans = points
    .map((p, i) => (p.isSummerStart ? [i - 1, i] : null))
    .filter(Boolean);

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const hoverX = hoverIndex != null ? xFor(hoverIndex, n) : 0;
  const hoverActual = hoverIndex != null ? actual[hoverIndex] : null;
  const hoverY =
    hoverIndex != null
      ? yFor(hoverActual != null ? Math.min(hoverActual, points[hoverIndex].goalCwpm) : points[hoverIndex].goalCwpm)
      : 0;

  const lastActualIndex = (() => {
    for (let i = actual.length - 1; i >= 0; i--) if (actual[i] != null) return i;
    return -1;
  })();

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h3>Fluency Growth Chart</h3>
        {student && (
          <button
            type="button"
            className="btn-small"
            style={{ flexShrink: 0 }}
            onClick={() => {
              const doc = generateFluencyReport(student, history || [], captiScores, iowaScores);
              doc.save(`${student.last_name}_${student.first_name}_fluency_report.pdf`);
            }}
          >
            Download PDF
          </button>
        )}
      </div>
      <p className="panel-desc">
        Baymonte's goal: every student reads {ON_TRACK_END.cwpm} correct words per minute (cwpm)
        by the end of Grade {ON_TRACK_END.grade}, starting from about {ON_TRACK_START.cwpm} cwpm at
        Grade 1 BOY — with end-of-year targets of {GRADE_EOY_GOAL[1]} (G1), {GRADE_EOY_GOAL[2]} (G2),
        and {GRADE_EOY_GOAL[3]} (G3) along the way. The goal line holds flat across each summer — a
        window where a student who keeps practicing stays on pace, and one who doesn't tends to
        slide. This is a planning target, not an Acadience benchmark cutoff.
      </p>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "12px 0 2px", fontSize: 12.5, color: "#334155" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 18, borderTop: `2px dashed ${GOAL_COLOR}` }} /> On-track goal
        </span>
        {hasActual && (
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 18, borderTop: `2px solid ${ACTUAL_COLOR}` }} /> Actual score
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef9f2726", border: `1px solid ${SUMMER_INK}` }} /> Summer
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`On-track fluency goal line, rising from ${ON_TRACK_START.cwpm} correct words per minute at Grade 1 beginning-of-year to ${ON_TRACK_END.cwpm} at Grade 4 end-of-year, holding flat each summer.${hasActual ? " Student's actual scores are overlaid where available." : ""}`}
          style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        >
          {/* Summer bands */}
          {summerSpans.map(([a, b]) => (
            <g key={`summer-${a}`}>
              <rect x={xFor(a, n)} y={MARGIN.top} width={xFor(b, n) - xFor(a, n)} height={PLOT_H} fill={SUMMER_FILL} />
              <text
                x={(xFor(a, n) + xFor(b, n)) / 2}
                y={MARGIN.top - 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                letterSpacing="0.06em"
                fill={SUMMER_INK}
                style={{ textTransform: "uppercase" }}
              >
                Summer
              </text>
            </g>
          ))}

          {/* Gridlines + y-axis labels */}
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={VIEW_W - MARGIN.right} y1={yFor(t)} y2={yFor(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8">
                {t}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text key={p.label} x={xFor(i, n)} y={VIEW_H - MARGIN.bottom + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {p.label}
            </text>
          ))}

          {/* Goal line — always dashed (dashed = target, solid = actual) */}
          <path d={goalPath} fill="none" stroke={GOAL_COLOR} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Actual-score line */}
          {actualPath && (
            <path d={actualPath} fill="none" stroke={ACTUAL_COLOR} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Start label */}
          <text x={xFor(0, n) + 8} y={yFor(points[0].goalCwpm) - 12} textAnchor="start" fontSize={11} fontWeight={600} fill="#475569">
            {ON_TRACK_START.cwpm} cwpm
          </text>

          {/* Goal end label — sits in the right margin past the last point,
              never over the plot, so it can't collide with a nearby dot */}
          <text x={xFor(n - 1, n) + 8} y={yFor(points[n - 1].goalCwpm) - 8} textAnchor="start" fontSize={11} fontWeight={600} fill="#475569">
            Goal: {ON_TRACK_END.cwpm}
          </text>

          {/* Actual end label — only shown once the actual line reaches the
              final period, where there's margin space for it; for a student
              still mid-trajectory, the tooltip/table carry the latest value
              instead of a label that would collide with a nearby dot */}
          {lastActualIndex === n - 1 && (
            <text
              x={xFor(lastActualIndex, n) + 8}
              y={yFor(actual[lastActualIndex]) + 18}
              textAnchor="start"
              fontSize={11}
              fontWeight={700}
              fill={ACTUAL_COLOR}
            >
              {Math.round(actual[lastActualIndex])} cwpm
            </text>
          )}

          {/* Goal points — dot + transparent hit target, hover/focus for tooltip */}
          {points.map((p, i) => (
            <g
              key={p.label}
              tabIndex={0}
              role="img"
              aria-label={`${p.label}: goal ${Math.round(p.goalCwpm)} correct words per minute${actual[i] != null ? `, actual ${Math.round(actual[i])}` : ""}`}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <circle cx={xFor(i, n)} cy={yFor(p.goalCwpm)} r={13} fill="transparent" />
              <circle cx={xFor(i, n)} cy={yFor(p.goalCwpm)} r={hoverIndex === i ? 4.5 : 3.5} fill={GOAL_COLOR} stroke="#fff" strokeWidth={2} />
              {actual[i] != null && (
                <circle cx={xFor(i, n)} cy={yFor(actual[i])} r={hoverIndex === i ? 5.5 : 4.5} fill={ACTUAL_COLOR} stroke="#fff" strokeWidth={2} />
              )}
            </g>
          ))}

          {/* Crosshair for the hovered/focused point */}
          {hovered && (
            <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={VIEW_H - MARGIN.bottom} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              left: `${(hoverX / VIEW_W) * 100}%`,
              top: `${(hoverY / VIEW_H) * 100}%`,
              transform: "translate(-50%, -130%)",
              background: "#0f172a",
              color: "#fff",
              borderRadius: 6,
              padding: "7px 11px",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.25)",
            }}
          >
            {hoverActual != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACTUAL_COLOR, flexShrink: 0 }} />
                <span style={{ color: "#cbd5e1" }}>Actual</span>
                <span style={{ fontWeight: 700 }}>{Math.round(hoverActual)}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: GOAL_COLOR, flexShrink: 0 }} />
              <span style={{ color: "#cbd5e1" }}>Goal</span>
              <span style={{ fontWeight: 700 }}>{Math.round(hovered.goalCwpm)}</span>
            </div>
            <div style={{ color: "#94a3b8", marginTop: 4, borderTop: "1px solid #ffffff22", paddingTop: 4 }}>{hovered.label}</div>
          </div>
        )}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>
          View scores as a table
        </summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="score-table">
            <thead>
              <tr>
                <th></th>
                {points.map((p) => (
                  <th key={p.label} className="measure-col">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, fontSize: 12, color: "#64748b" }}>Goal</td>
                {points.map((p) => (
                  <td key={p.label} className="score-cell">{Math.round(p.goalCwpm)}</td>
                ))}
              </tr>
              {hasActual && (
                <tr>
                  <td style={{ fontWeight: 600, fontSize: 12, color: ACTUAL_COLOR }}>Actual</td>
                  {points.map((p, i) => (
                    <td key={p.label} className="score-cell" style={{ color: actual[i] != null ? ACTUAL_COLOR : "#cbd5e1" }}>
                      {actual[i] != null ? Math.round(actual[i]) : "—"}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
