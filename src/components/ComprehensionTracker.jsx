import { useState } from "react";
import {
  COMPREHENSION_WEIGHTS,
  getComprehensionPoints,
  getOverallComprehensionIndicator,
} from "../lib/comprehension";

// ---------------------------------------------------------------------------
// Layout constants (SVG viewBox units — each <svg> scales responsively)
// ---------------------------------------------------------------------------
const VIEW_W = 720;
const VIEW_H = 200;
const MARGIN = { top: 24, right: 46, bottom: 28, left: 34 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

const DATA_COLOR = "#2563eb"; // blue — fallback when a point has no risk-label rating

/**
 * Pick a "nice" axis max + step for an auto-scaled y-axis (no fixed domain
 * given). Rounds up to a human-friendly step (1/2/5/10 x a power of ten).
 */
function niceStep(maxValue, targetTicks = 4) {
  if (maxValue <= 0) return 1;
  const rough = maxValue / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

function autoDomain(values) {
  const max = Math.max(...values, 0);
  const step = niceStep(max) || 1;
  const niceMax = Math.max(Math.ceil(max / step) * step, step);
  const ticks = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  return { min: 0, max: niceMax, ticks };
}

/** Small colored pill showing a risk label, e.g. "On Track". */
function RiskBadge({ risk }) {
  if (!risk) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        color: risk.color,
        background: risk.color + "1a",
        border: `1px solid ${risk.color}44`,
        borderRadius: 20,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: risk.color, flexShrink: 0 }} />
      {risk.label}
    </span>
  );
}

/**
 * One measure's mini line chart: actual scores over the periods where the
 * student has data for that measure. No goal line — just what was observed.
 * Each point is colored by its risk label (Advanced / On Track / At Some
 * Risk / At High Risk) when one is available for that measure.
 */
function MiniLineChart({ title, description, points, domain, valueLabel }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (points.length === 0) {
    return (
      <div className="panel">
        <h3>{title}</h3>
        <p className="panel-desc">{description}</p>
        <div className="no-data" style={{ padding: 20 }}>No {title} data on file yet.</div>
      </div>
    );
  }

  const n = points.length;
  const { min, max, ticks } = domain || autoDomain(points.map((p) => p.value));

  const xFor = (i) => (n === 1 ? MARGIN.left + PLOT_W / 2 : MARGIN.left + (i / (n - 1)) * PLOT_W);
  const yFor = (v) => MARGIN.top + (1 - (v - min) / (max - min)) * PLOT_H;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(" ");

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const hoverX = hoverIndex != null ? xFor(hoverIndex) : 0;
  const hoverY = hoverIndex != null ? yFor(points[hoverIndex].value) : 0;
  const latestRisk = points[n - 1].risk;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {latestRisk && <RiskBadge risk={latestRisk} />}
      </div>
      <p className="panel-desc">{description}</p>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`${title} over time, from ${points[0].label} to ${points[n - 1].label}.`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={VIEW_W - MARGIN.right} y1={yFor(t)} y2={yFor(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8">
                {t}
              </text>
            </g>
          ))}

          {points.map((p, i) => (
            <text
              key={p.label + i}
              x={xFor(i)}
              y={VIEW_H - MARGIN.bottom + 16}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={10}
              fill="#94a3b8"
            >
              {p.label}
            </text>
          ))}

          {n > 1 && (
            <path d={linePath} fill="none" stroke={DATA_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* End label — most recent value */}
          <text x={xFor(n - 1)} y={yFor(points[n - 1].value) - 12} textAnchor="end" fontSize={11} fontWeight={600} fill="#475569">
            {valueLabel(points[n - 1].value)}
          </text>

          {points.map((p, i) => (
            <g
              key={p.label + i}
              tabIndex={0}
              role="img"
              aria-label={`${p.label}: ${valueLabel(p.value)}${p.risk ? `, ${p.risk.label}` : ""}`}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <circle cx={xFor(i)} cy={yFor(p.value)} r={12} fill="transparent" />
              <circle
                cx={xFor(i)}
                cy={yFor(p.value)}
                r={hoverIndex === i ? 5 : 4}
                fill={p.risk ? p.risk.color : DATA_COLOR}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          ))}

          {hovered && (
            <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={VIEW_H - MARGIN.bottom} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>

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
            <div style={{ fontWeight: 700 }}>{valueLabel(hovered.value)}</div>
            {hovered.risk && <div style={{ color: hovered.risk.color, fontWeight: 600 }}>{hovered.risk.label}</div>}
            <div style={{ color: "#cbd5e1" }}>{hovered.label}</div>
          </div>
        )}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>View as a table</summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="score-table">
            <thead>
              <tr>{points.map((p, i) => <th key={p.label + i} className="measure-col">{p.label}</th>)}</tr>
            </thead>
            <tbody>
              <tr>{points.map((p, i) => <td key={p.label + i} className="score-cell">{valueLabel(p.value)}</td>)}</tr>
              <tr>
                {points.map((p, i) => (
                  <td key={p.label + i} className="score-cell" style={{ fontSize: 11, color: p.risk ? p.risk.color : "#cbd5e1" }}>
                    {p.risk ? p.risk.label : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * Comprehension tracker: shows each comprehension-related measure the
 * student has on file as its own small chart of actual scores over time.
 * There's no single universal comprehension metric the way ORF cwpm covers
 * fluency, and no schoolwide comprehension goal defined yet — so this is
 * "what was observed," plotted separately per measure, with each score
 * rated Advanced / On Track / At Some Risk / At High Risk.
 */
export default function ComprehensionTracker({ history, captiScores, iowaScores }) {
  const { retell: retellPoints, maze: mazePoints, capti: captiPoints, iowa: iowaPoints } =
    getComprehensionPoints(history, captiScores, iowaScores);

  const overall = getOverallComprehensionIndicator({
    iowa: iowaPoints[iowaPoints.length - 1]?.risk,
    capti: captiPoints[captiPoints.length - 1]?.risk,
    maze: mazePoints[mazePoints.length - 1]?.risk,
    retell: retellPoints[retellPoints.length - 1]?.risk,
  });

  const breakdown = [
    { key: "iowa", name: "Iowa", points: iowaPoints },
    { key: "capti", name: "Capti", points: captiPoints },
    { key: "maze", name: "Maze", points: mazePoints },
    { key: "retell", name: "Retell", points: retellPoints },
  ];

  return (
    <div>
      <div className="panel">
        <h3 style={{ marginBottom: 4 }}>Overall Comprehension</h3>
        <p className="panel-desc" style={{ marginBottom: 14 }}>
          A weighted blend of whichever comprehension measures this student has on file — Iowa
          and Capti count most, Maze next, and Retell Quality lightest, since it's a single
          rater's judgment call rather than a scored task. A measure with no data yet is left
          out and the rest reweighted. This isn't an Acadience score — just a quick read on the
          overall comprehension picture.
        </p>

        {overall ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 17,
              fontWeight: 700,
              color: overall.color,
              background: overall.color + "18",
              border: `1px solid ${overall.color}55`,
              borderRadius: 10,
              padding: "8px 16px",
              marginBottom: 14,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: overall.color, flexShrink: 0 }} />
            {overall.label}
          </div>
        ) : (
          <div className="no-data" style={{ padding: 16, marginBottom: 14 }}>
            Not enough comprehension data yet for an overall indicator.
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {breakdown.map((b) => {
            const latest = b.points[b.points.length - 1];
            return (
              <div
                key={b.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <span style={{ fontWeight: 600, color: "#334155" }}>{b.name}</span>
                <span style={{ color: "#94a3b8" }}>({Math.round(COMPREHENSION_WEIGHTS[b.key] * 100)}%)</span>
                {latest?.risk ? (
                  <span style={{ color: latest.risk.color, fontWeight: 600 }}>{latest.risk.label}</span>
                ) : (
                  <span style={{ color: "#cbd5e1" }}>no data</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="panel-desc" style={{ marginBottom: 12 }}>
        Comprehension is measured a few different ways depending on grade and tool — Retell
        Quality of Response, Maze, Capti ReadBasix Reading Comprehension, and the Iowa
        Assessments Reading score each use their own scale, so they're tracked as separate
        charts rather than combined into one. Each score is rated against that measure's own
        benchmark: Advanced, On Track, At Some Risk, or At High Risk.
      </p>

      <MiniLineChart
        title="Retell Quality of Response"
        description="Rated 1–4 after the ORF retell (collected grades 2–6, most BOY/MOY/EOY periods)."
        points={retellPoints}
        domain={{ min: 0, max: 4, ticks: [1, 2, 3, 4] }}
        valueLabel={(v) => `${v}`}
      />

      <MiniLineChart
        title="Maze"
        description="Adjusted score (correct − incorrect ÷ 2) from the silent-reading comprehension check (collected grades 3+)."
        points={mazePoints}
        valueLabel={(v) => `${v}`}
      />

      <MiniLineChart
        title="Capti ReadBasix — Reading Comprehension"
        description="Scaled reading comprehension score from Capti ReadBasix (collected grades 5+)."
        points={captiPoints}
        valueLabel={(v) => `${v}`}
      />

      <MiniLineChart
        title="Iowa Assessments — Reading"
        description="Reading National Percentile Rank from the Iowa Assessments (collected grades 3+, once per year)."
        points={iowaPoints}
        domain={{ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }}
        valueLabel={(v) => `${v} NPR`}
      />
    </div>
  );
}
