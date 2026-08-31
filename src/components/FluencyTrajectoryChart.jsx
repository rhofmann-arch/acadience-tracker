import { useState } from "react";
import { ON_TRACK_TRAJECTORY, ON_TRACK_START, ON_TRACK_END } from "../lib/trajectory";

// ---------------------------------------------------------------------------
// Layout constants (SVG viewBox units — the <svg> scales responsively)
// ---------------------------------------------------------------------------
const VIEW_W = 720;
const VIEW_H = 300;
const MARGIN = { top: 30, right: 46, bottom: 30, left: 34 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;
const Y_MAX = 110; // headroom above the 100 cwpm goal
const Y_TICKS = [0, 20, 40, 60, 80, 100];

const GOAL_COLOR = "#64748b"; // slate — a reference/target line, not a status color

function xFor(i, n) {
  return MARGIN.left + (i / (n - 1)) * PLOT_W;
}
function yFor(value) {
  return MARGIN.top + (1 - value / Y_MAX) * PLOT_H;
}

/**
 * Chart showing Baymonte's on-track ORF fluency trajectory: 15 cwpm at
 * Grade 1 BOY to 100 cwpm at Grade 4 EOY, plotted across the 12 BOY/MOY/EOY
 * benchmark periods in between.
 *
 * Future: a second series (a student's actual ORF words-correct scores over
 * the same periods) can be overlaid here to compare real progress against
 * this goal line.
 */
export default function FluencyTrajectoryChart() {
  const [hoverIndex, setHoverIndex] = useState(null);
  const points = ON_TRACK_TRAJECTORY;
  const n = points.length;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i, n).toFixed(1)} ${yFor(p.goalCwpm).toFixed(1)}`)
    .join(" ");

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const hoverX = hoverIndex != null ? xFor(hoverIndex, n) : 0;
  const hoverY = hoverIndex != null ? yFor(points[hoverIndex].goalCwpm) : 0;

  return (
    <div className="panel">
      <h3>Fluency Growth Chart</h3>
      <p className="panel-desc">
        Baymonte's goal: every student reads {ON_TRACK_END.cwpm} correct words per minute
        (cwpm) by the end of Grade {ON_TRACK_END.grade}. Students typically enter Grade 1 at
        about {ON_TRACK_START.cwpm} cwpm. Grades 1–2 build phonics knowledge through direct
        instruction; Grades 3–4 consolidate that knowledge as students meet longer,
        multisyllabic words. The dashed line below is the on-track pace between those two
        points — a planning target, not an Acadience benchmark cutoff.
      </p>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`On-track fluency goal line, rising from ${ON_TRACK_START.cwpm} correct words per minute at Grade 1 beginning-of-year to ${ON_TRACK_END.cwpm} at Grade 4 end-of-year.`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {/* Gridlines + y-axis labels */}
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={VIEW_W - MARGIN.right}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={yFor(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#94a3b8"
              >
                {t}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text
              key={p.label}
              x={xFor(i, n)}
              y={VIEW_H - MARGIN.bottom + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#94a3b8"
            >
              {p.label}
            </text>
          ))}

          {/* Goal line */}
          <path d={linePath} fill="none" stroke={GOAL_COLOR} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Start label */}
          <text x={xFor(0, n)} y={yFor(points[0].goalCwpm) - 12} textAnchor="start" fontSize={11} fontWeight={600} fill="#475569">
            {ON_TRACK_START.cwpm} cwpm
          </text>

          {/* End label */}
          <text x={xFor(n - 1, n)} y={yFor(points[n - 1].goalCwpm) - 12} textAnchor="end" fontSize={11} fontWeight={600} fill="#475569">
            Goal: {ON_TRACK_END.cwpm} cwpm
          </text>

          {/* Points — dot + transparent hit target, hover/focus for tooltip */}
          {points.map((p, i) => (
            <g
              key={p.label}
              tabIndex={0}
              role="img"
              aria-label={`${p.label}: goal ${Math.round(p.goalCwpm)} correct words per minute`}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <circle cx={xFor(i, n)} cy={yFor(p.goalCwpm)} r={12} fill="transparent" />
              <circle
                cx={xFor(i, n)}
                cy={yFor(p.goalCwpm)}
                r={hoverIndex === i ? 5 : 4}
                fill={GOAL_COLOR}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          ))}

          {/* Crosshair for the hovered/focused point */}
          {hovered && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={MARGIN.top}
              y2={VIEW_H - MARGIN.bottom}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
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
              padding: "6px 10px",
              fontSize: 12,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.25)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{Math.round(hovered.goalCwpm)} cwpm</div>
            <div style={{ color: "#cbd5e1" }}>{hovered.label} goal</div>
          </div>
        )}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>
          View goal values as a table
        </summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="score-table">
            <thead>
              <tr>
                {points.map((p) => (
                  <th key={p.label} className="measure-col">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {points.map((p) => (
                  <td key={p.label} className="score-cell">{Math.round(p.goalCwpm)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
