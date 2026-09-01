/**
 * PDF report generation for Acadience Reading Tracker.
 *
 * Reports:
 *   1. Student Longitudinal Report — one page per student
 *   2. Classroom Snapshot — printable class roster with scores
 *   3. Classroom Growth Report — BOY/MOY/EOY composite and ORF side by side
 *   4. Fluency Growth Report — one student's fluency chart + comprehension summary
 *      (also available for a whole class, one page per student)
 *   5. Teacher Dashboard — whole-class fluency & comprehension risk tables
 *   6. Grade 1 Reading Risk Report — composite-centered report + dashboard
 *      for Grade 1 (and eventually Kindergarten EOY)
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getBenchmarkStatus,
  getMeasuresForGradePeriod,
  getThresholds,
  mclassLevelToStatus,
  benchmarkStatusToRiskLabel,
  RISK_LABEL,
  STATUS,
} from "./scoringEngine";
import { ON_TRACK_TRAJECTORY, ON_TRACK_START, ON_TRACK_END, GRADE_EOY_GOAL, getActualScores } from "./trajectory";
import { getComprehensionSummary, getComprehensionWeights } from "./comprehension";
import {
  buildGrade1Assessment,
  getRecommendationReasoning,
  ordinal,
} from "./grade1Report";

// ---------------------------------------------------------------------------
// Colors and constants
// ---------------------------------------------------------------------------
const COLORS = {
  above: [29, 158, 117],     // #1D9E75
  at: [77, 184, 146],        // #4db892
  below: [239, 159, 39],     // #EF9F27
  wellBelow: [216, 90, 48],  // #D85A30
  header: [15, 23, 42],      // #0f172a
  subheader: [71, 85, 105],  // #475569
  lightGray: [241, 245, 249],
  white: [255, 255, 255],
  goalLine: [100, 116, 139],   // #64748b — slate, the fluency goal line
  actualLine: [37, 99, 235],   // #2563eb — blue, a student's actual score
  gridline: [226, 232, 240],   // #e2e8f0
  tickText: [148, 163, 184],   // #94a3b8
  summerFill: [253, 246, 227], // pale amber wash
  summerInk: [179, 118, 15],   // #b3760f
};

/** "#rrggbb" -> [r, g, b] (0-255 each), for colors that arrive as hex strings
 * (e.g. from scoringEngine's RISK_LABEL) rather than the COLORS table above. */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const MEASURE_LABELS = {
  composite: "Composite",
  fsf: "FSF",
  lnf: "LNF",
  psf: "PSF",
  nwf_cls: "NWF-CLS",
  nwf_wwr: "NWF-WWR",
  orf_words: "ORF Words",
  orf_accuracy: "ORF Acc%",
  retell: "Retell",
  retell_quality: "Retell Q",
  maze: "Maze",
};

const GRADE_LABELS = {
  K: "Kindergarten",
  1: "Grade 1",
  2: "Grade 2",
  3: "Grade 3",
  4: "Grade 4",
  5: "Grade 5",
  6: "Grade 6",
  7: "Grade 7",
  8: "Grade 8",
};

// ---------------------------------------------------------------------------
// Capti ReadBasix constants
// ---------------------------------------------------------------------------
const CAPTI_MEASURES = [
  { key: "word_recognition", label: "Word Recog." },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "morphology", label: "Morphology" },
  { key: "sentence_processing", label: "Sent. Proc." },
  { key: "reading_efficiency", label: "Read. Eff." },
  { key: "reading_comprehension", label: "Read. Comp." },
  { key: "lexile", label: "Lexile" },
];

function getCaptiStatusColor(score) {
  if (score == null || score === "") return null;
  const n = typeof score === "number" ? score : Number(score);
  if (isNaN(n)) return null;
  if (n >= 265) return COLORS.above;      // Strong
  if (n >= 250) return COLORS.above;      // High Average
  if (n >= 236) return COLORS.below;      // Low Average (amber)
  return COLORS.wellBelow;                 // Weak (red)
}

function getStatusColor(status) {
  if (!status) return null;
  if (status.status === STATUS.ABOVE.status) return COLORS.above;
  if (status.status === STATUS.AT.status) return COLORS.at;
  if (status.status === STATUS.BELOW.status) return COLORS.below;
  if (status.status === STATUS.WELL_BELOW.status) return COLORS.wellBelow;
  return null;
}

function getScoreStatus(grade, period, measure, value, scoreRow) {
  const isMclass = scoreRow?.data_source === "mClass";

  // For mClass composite, always use mClass-provided level for consistency
  if (isMclass && measure === "composite") {
    const level = scoreRow.mclass_composite_level;
    if (level) return mclassLevelToStatus(level);
    return null;
  }

  const result = getBenchmarkStatus(grade, period, measure, value);
  if (result) return result;
  if (scoreRow) {
    const levelKey = `${measure}_level`;
    const level = scoreRow[levelKey];
    if (level) return mclassLevelToStatus(level);
  }
  return null;
}

function formatScore(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(1);
  return String(value);
}

// ---------------------------------------------------------------------------
// Recommendations based on benchmark status
// ---------------------------------------------------------------------------
function getRecommendations(grade, period, scoreRow) {
  if (!scoreRow) return [];
  const recs = [];

  // Check composite status
  const compStatus = getScoreStatus(grade, period, "composite",
    scoreRow.composite, scoreRow);

  if (compStatus?.status === STATUS.WELL_BELOW.status) {
    recs.push("Overall composite is Well Below Benchmark. Recommend intensive intervention and diagnostic assessment (Acadience Reading Diagnostic) to identify specific skill gaps.");
  } else if (compStatus?.status === STATUS.BELOW.status) {
    recs.push("Overall composite is Below Benchmark. Recommend strategic, targeted small-group intervention in deficit areas.");
  }

  // Check specific measures
  const measures = getMeasuresForGradePeriod(grade, period) || [];
  for (const m of measures) {
    if (m === "composite" || m === "lnf") continue;
    const val = scoreRow[m];
    if (val == null) continue;
    const status = getScoreStatus(grade, period, m, val, scoreRow);
    if (!status) continue;

    if (status.status === STATUS.WELL_BELOW.status) {
      switch (m) {
        case "fsf":
          recs.push("First Sound Fluency is Well Below — focus on phonological awareness activities, especially isolating initial sounds.");
          break;
        case "psf":
          recs.push("Phoneme Segmentation is Well Below — needs explicit instruction in segmenting words into individual sounds.");
          break;
        case "nwf_cls":
          recs.push("Nonsense Word Fluency (letter sounds) is Well Below — needs intensive phonics instruction on letter-sound correspondences.");
          break;
        case "nwf_wwr":
          recs.push("Decoding (whole words read) is Well Below — needs practice blending sounds into whole words.");
          break;
        case "orf_words":
          recs.push("Oral Reading Fluency is Well Below — needs repeated reading practice with decodable and grade-level texts, and fluency-building strategies.");
          break;
        case "orf_accuracy":
          recs.push("Reading Accuracy is Well Below — focus on decoding accuracy before fluency. Check for gaps in phonics knowledge.");
          break;
        case "retell":
          recs.push("Retell is Well Below — needs comprehension strategy instruction (summarizing, identifying main ideas, retelling structure).");
          break;
        case "maze":
          recs.push("Maze (comprehension) is Well Below — needs vocabulary and reading comprehension strategy support.");
          break;
      }
    }
  }

  // Positive note if at or above
  if (compStatus?.status === STATUS.ABOVE.status || compStatus?.status === STATUS.AT.status) {
    if (recs.length === 0) {
      recs.push("Student is meeting or exceeding grade-level benchmark goals. Continue with core instruction and enrichment opportunities.");
    }
  }

  if (recs.length === 0) {
    recs.push("Continue monitoring progress at next benchmark period.");
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Student Longitudinal Report
// ---------------------------------------------------------------------------
export function generateStudentReport(student, history, pmScores, captiScores) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.header);
  doc.text("Acadience Reading — Student Report", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text("Baymonte Christian School", margin, y);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 20;

  // Student info
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.header);
  doc.text(`${student.first_name} ${student.last_name}`, margin, y);
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  const meta = [`ID: ${student.student_id}`];
  if (student.dob) meta.push(`DOB: ${student.dob}`);
  if (student.cohort_year) meta.push(`Cohort: ${student.cohort_year}`);
  doc.text(meta.join("  ·  "), margin, y);
  y += 20;

  // Line separator
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 15;

  // Group history by year
  const byYear = {};
  for (const row of history) {
    if (!byYear[row.school_year]) byYear[row.school_year] = { acadience: [], capti: [] };
    byYear[row.school_year].acadience.push(row);
  }

  // Interleave Capti scores by year
  if (captiScores) {
    for (const rec of captiScores) {
      if (!byYear[rec.school_year]) byYear[rec.school_year] = { acadience: [], capti: [] };
      byYear[rec.school_year].capti.push(rec);
    }
  }

  // Reverse chronological order
  const sortedYears = Object.keys(byYear).sort().reverse();

  // --- Score tables per year ---
  for (const year of sortedYears) {
    const { acadience: rows, capti } = byYear[year];
    const grade = rows[0]?.grade || capti[0]?.grade || "";

    // Check if we need a new page
    if (y > 650) {
      doc.addPage();
      y = margin;
    }

    // --- Acadience scores ---
    if (rows.length > 0) {
      // Year/grade header
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.header);
      doc.text(`${year} — ${GRADE_LABELS[grade] || "Grade " + grade}`, margin, y);
      y += 8;

      // Collect all measures for this year
      const allMeasures = new Set();
      for (const row of rows) {
        const ms = getMeasuresForGradePeriod(row.grade, row.period);
        if (ms) ms.forEach((m) => allMeasures.add(m));
      }
      const measures = [...allMeasures];

      // Build table data
      const head = [["Period", ...measures.map((m) => MEASURE_LABELS[m] || m)]];
      const body = rows.map((row) => {
        return [
          row.period,
          ...measures.map((m) => {
            let val = row[m];
            if (m === "composite" && val == null && row.mclass_composite != null) {
              return formatScore(row.mclass_composite) + "*";
            }
            return formatScore(val);
          }),
        ];
      });

      autoTable(doc, {
        startY: y,
        head,
        body,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 3,
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: COLORS.lightGray,
          textColor: COLORS.subheader,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 0) {
            data.cell.styles.halign = "center";

            const measure = measures[data.column.index - 1];
            const row = rows[data.row.index];
            const val = row[measure];
            const status = getScoreStatus(row.grade, row.period, measure, val, row);
            const color = getStatusColor(status);
            if (color) {
              data.cell.styles.fillColor = [...color, 35].length ? color : COLORS.white;
              data.cell.styles.textColor = COLORS.white;
            }
          }
        },
        theme: "grid",
      });

      y = doc.lastAutoTable.finalY + 12;

      // Recommendations for most recent period in this year
      const latestRow = rows[rows.length - 1];
      const recs = getRecommendations(grade, latestRow.period, latestRow);

      if (recs.length > 0 && y < 680) {
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.subheader);
        doc.text("Recommendations:", margin, y);
        y += 11;

        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        for (const rec of recs) {
          const lines = doc.splitTextToSize(`• ${rec}`, pageWidth - margin * 2);
          if (y + lines.length * 10 > 720) break;
          doc.text(lines, margin + 8, y);
          y += lines.length * 10 + 2;
        }
        y += 8;
      }
    }

    // --- Capti ReadBasix scores ---
    if (capti.length > 0) {
      if (y > 650) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(11);
      doc.setTextColor(...COLORS.header);
      doc.text(`${year} — Grade ${capti[0].grade} (Capti ReadBasix)`, margin, y);
      y += 8;

      const captiHead = [["Period", ...CAPTI_MEASURES.map((m) => m.label)]];
      const captiBody = capti.map((rec) => [
        rec.period,
        ...CAPTI_MEASURES.map((m) => formatScore(rec[m.key])),
      ]);

      autoTable(doc, {
        startY: y,
        head: captiHead,
        body: captiBody,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 3,
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [240, 253, 244],   // light green background
          textColor: COLORS.subheader,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 0) {
            data.cell.styles.halign = "center";
            const mKey = CAPTI_MEASURES[data.column.index - 1]?.key;
            if (mKey) {
              const rec = capti[data.row.index];
              const color = getCaptiStatusColor(rec?.[mKey]);
              if (color) {
                data.cell.styles.fillColor = color;
                data.cell.styles.textColor = COLORS.white;
              }
            }
          }
        },
        theme: "grid",
      });

      y = doc.lastAutoTable.finalY + 12;
    }
  }

  // --- Progress Monitoring section ---
  if (pmScores && pmScores.length > 0) {
    if (y > 600) {
      doc.addPage();
      y = margin;
    }

    // Section header
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.header);
    doc.text("Progress Monitoring", margin, y);
    y += 6;

    doc.setDrawColor(239, 159, 39); // orange accent line
    doc.setLineWidth(2);
    doc.line(margin, y, margin + 120, y);
    y += 12;

    // Determine which measures have PM data
    const pmMeasureKeys = [
      "composite", "fsf", "lnf", "psf", "nwf_cls", "nwf_wwr",
      "orf_words", "orf_accuracy", "retell", "retell_quality", "maze",
    ];
    const pmMeasures = pmMeasureKeys.filter((m) =>
      pmScores.some((s) => s[m] != null && s[m] !== "")
    );

    if (pmMeasures.length > 0) {
      const pmHead = [["Date", "Grade", ...pmMeasures.map((m) => MEASURE_LABELS[m] || m)]];
      const pmBody = pmScores.map((row) => [
        row.assessment_date || "",
        row.grade || "",
        ...pmMeasures.map((m) => formatScore(row[m])),
      ]);

      autoTable(doc, {
        startY: y,
        head: pmHead,
        body: pmBody,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [255, 243, 224], // light orange background
          textColor: [146, 64, 14],   // dark orange text
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold" },
          1: { halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 1) {
            data.cell.styles.halign = "center";
          }
        },
        theme: "grid",
      });

      y = doc.lastAutoTable.finalY + 8;

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Progress monitoring scores are shown without benchmark status coloring.", margin, y);
      y += 12;
    }
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Acadience Reading Tracker — Baymonte Christian School — Confidential",
      pageWidth / 2, doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Classroom Snapshot PDF
// ---------------------------------------------------------------------------
export function generateClassroomReport(classInfo, students, grade, period, year) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;
  let y = margin;

  const measures = getMeasuresForGradePeriod(grade, period) || [];

  // Header
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.header);
  doc.text("Classroom Benchmark Report", margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text(
    `${year}  ·  ${period}  ·  ${GRADE_LABELS[grade] || "Grade " + grade}  ·  ${classInfo.teacher || ""} (${classInfo.class_id})`,
    margin, y
  );
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 5;

  // Summary counts
  const counts = { above: 0, at: 0, below: 0, wellBelow: 0, total: 0 };
  for (const { score } of students) {
    if (!score) continue;
    const status = getScoreStatus(grade, period, "composite", score.composite, score);
    if (!status) continue;
    counts.total++;
    if (status.status === STATUS.ABOVE.status) counts.above++;
    else if (status.status === STATUS.AT.status) counts.at++;
    else if (status.status === STATUS.BELOW.status) counts.below++;
    else if (status.status === STATUS.WELL_BELOW.status) counts.wellBelow++;
  }

  // Build table
  const head = [["Student", ...measures.map((m) => MEASURE_LABELS[m] || m)]];
  const body = students.map(({ student, score }) => {
    const name = `${student.last_name}, ${student.first_name}`;
    return [
      name,
      ...measures.map((m) => {
        if (!score) return "—";
        let val = score[m];
        if (m === "composite" && val == null && score.mclass_composite != null) {
          return formatScore(score.mclass_composite) + "*";
        }
        return formatScore(val);
      }),
    ];
  });

  autoTable(doc, {
    startY: y + 10,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: COLORS.lightGray,
      textColor: COLORS.subheader,
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 120 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index > 0) {
        data.cell.styles.halign = "center";

        const measure = measures[data.column.index - 1];
        const studentData = students[data.row.index];
        const score = studentData?.score;
        if (score) {
          const val = score[measure];
          const status = getScoreStatus(grade, period, measure, val, score);
          const color = getStatusColor(status);
          if (color) {
            data.cell.styles.fillColor = color;
            data.cell.styles.textColor = COLORS.white;
          }
        }
      }
    },
    theme: "grid",
  });

  y = doc.lastAutoTable.finalY + 15;

  // Summary line
  if (counts.total > 0) {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.subheader);
    const atOrAbove = Math.round(((counts.above + counts.at) / counts.total) * 100);
    doc.text(
      `Composite Summary: ${atOrAbove}% at or above benchmark (${counts.above} above, ${counts.at} at, ${counts.below} below, ${counts.wellBelow} well below — ${counts.total} students)`,
      margin, y
    );
    y += 14;
  }

  // Legend
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const legendY = y + 5;
  const legends = [
    { label: "Above Benchmark", color: COLORS.above },
    { label: "At Benchmark", color: COLORS.at },
    { label: "Below Benchmark", color: COLORS.below },
    { label: "Well Below Benchmark", color: COLORS.wellBelow },
  ];
  let lx = margin;
  for (const { label, color } of legends) {
    doc.setFillColor(...color);
    doc.rect(lx, legendY - 6, 8, 8, "F");
    doc.text(label, lx + 12, legendY);
    lx += doc.getTextWidth(label) + 24;
  }

  doc.text("* = mClass composite (Acadience composite unavailable)", lx + 10, legendY);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Acadience Reading Tracker — Baymonte Christian School — Confidential",
    pageWidth / 2, doc.internal.pageSize.getHeight() - 15,
    { align: "center" }
  );

  return doc;
}

// ---------------------------------------------------------------------------
// Capti ReadBasix Classroom Snapshot PDF (Grades 5+)
// ---------------------------------------------------------------------------
export function generateCaptiClassroomReport(classInfo, students, grade, period, year) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;
  let y = margin;

  // Header
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.header);
  doc.text("Classroom Benchmark Report — Capti ReadBasix", margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text(
    `${year}  ·  ${period}  ·  ${GRADE_LABELS[grade] || "Grade " + grade}  ·  ${classInfo.teacher || ""} (${classInfo.class_id})`,
    margin, y
  );
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 5;

  // Build table
  const head = [["Student", ...CAPTI_MEASURES.map((m) => m.label)]];
  const body = students.map(({ student, score }) => {
    const name = `${student.last_name}, ${student.first_name}`;
    return [
      name,
      ...CAPTI_MEASURES.map((m) => {
        if (!score) return "\u2014";
        return formatScore(score[m.key]);
      }),
    ];
  });

  autoTable(doc, {
    startY: y + 10,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: COLORS.lightGray,
      textColor: COLORS.subheader,
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 120 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index > 0) {
        data.cell.styles.halign = "center";

        const mKey = CAPTI_MEASURES[data.column.index - 1]?.key;
        const studentData = students[data.row.index];
        const score = studentData?.score;
        if (score && mKey) {
          const color = getCaptiStatusColor(score[mKey]);
          if (color) {
            data.cell.styles.fillColor = color;
            data.cell.styles.textColor = COLORS.white;
          }
        }
      }
    },
    theme: "grid",
  });

  y = doc.lastAutoTable.finalY + 15;

  // Legend
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const legendY = y + 5;
  const legends = [
    { label: "Strong (265+)", color: COLORS.above },
    { label: "High Average (250-264)", color: COLORS.at },
    { label: "Low Average (236-249)", color: COLORS.below },
    { label: "Weak (190-235)", color: COLORS.wellBelow },
  ];
  let lx = margin;
  for (const { label, color } of legends) {
    doc.setFillColor(...color);
    doc.rect(lx, legendY - 6, 8, 8, "F");
    doc.text(label, lx + 12, legendY);
    lx += doc.getTextWidth(label) + 24;
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Acadience Reading Tracker — Baymonte Christian School — Confidential",
    pageWidth / 2, doc.internal.pageSize.getHeight() - 15,
    { align: "center" }
  );

  return doc;
}

// ---------------------------------------------------------------------------
// Classroom Growth Report
// ---------------------------------------------------------------------------

/**
 * Generate a growth report showing BOY → MOY → EOY scores side by side.
 * Page 1: Composite scores. Page 2: ORF Words scores.
 *
 * @param {object} classInfo - { class_id, teacher, grade }
 * @param {Array} studentsWithScores - array of { student, scores: { BOY, MOY, EOY } }
 *        where each period value is the score row or null
 * @param {string} grade
 * @param {string} year
 */
export function generateGrowthReport(classInfo, studentsWithScores, grade, year) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 30;

  // Determine which periods have data
  const periods = ["BOY", "MOY", "EOY"].filter((p) =>
    studentsWithScores.some((s) => s.scores[p])
  );

  if (periods.length === 0) return doc;

  // Sort students by last name
  const sorted = [...studentsWithScores].sort((a, b) =>
    (a.student.last_name || "").localeCompare(b.student.last_name || "")
  );

  // --- Helper to build one page ---
  function buildPage(title, measure, displayLabel) {
    let y = margin;

    // Header
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.header);
    doc.text(`Classroom Growth Report — ${displayLabel}`, margin, y);
    y += 18;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.subheader);
    doc.text(
      `${year}  ·  ${GRADE_LABELS[grade] || "Grade " + grade}  ·  ${classInfo.teacher || ""} (${classInfo.class_id})`,
      margin, y
    );
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
    y += 5;

    // Build column headers: Student | BOY | MOY | EOY | Growth (BOY→latest)
    const lastPeriod = periods[periods.length - 1];
    const showGrowth = periods.length > 1;
    const headCols = ["Student", ...periods];
    if (showGrowth) headCols.push(`Growth (${periods[0]}→${lastPeriod})`);

    const head = [headCols];

    const body = sorted.map(({ student, scores }) => {
      const name = `${student.last_name}, ${student.first_name}`;
      const row = [name];

      let firstVal = null;
      let lastVal = null;

      for (const p of periods) {
        const scoreRow = scores[p];
        let val = scoreRow?.[measure];

        // For composite, fall back to mClass composite
        if (measure === "composite" && val == null && scoreRow?.mclass_composite != null) {
          val = scoreRow.mclass_composite;
          row.push(formatScore(val) + "*");
        } else {
          row.push(formatScore(val));
        }

        if (val != null && !isNaN(val)) {
          if (firstVal == null) firstVal = Number(val);
          lastVal = Number(val);
        }
      }

      if (showGrowth) {
        if (firstVal != null && lastVal != null && firstVal !== lastVal) {
          const diff = lastVal - firstVal;
          row.push((diff > 0 ? "+" : "") + diff);
        } else {
          row.push("—");
        }
      }

      return row;
    });

    autoTable(doc, {
      startY: y + 10,
      head,
      body,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: COLORS.lightGray,
        textColor: COLORS.subheader,
        fontStyle: "bold",
        halign: "center",
        fontSize: 9,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: 130 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const colIdx = data.column.index;

        // Score columns (1 through periods.length)
        if (colIdx >= 1 && colIdx <= periods.length) {
          data.cell.styles.halign = "center";
          const p = periods[colIdx - 1];
          const studentData = sorted[data.row.index];
          const scoreRow = studentData?.scores[p];
          if (scoreRow) {
            const val = scoreRow[measure];
            const status = getScoreStatus(grade, p, measure, val, scoreRow);
            const color = getStatusColor(status);
            if (color) {
              data.cell.styles.fillColor = color;
              data.cell.styles.textColor = COLORS.white;
            }
          }
        }

        // Growth column
        if (showGrowth && colIdx === periods.length + 1) {
          data.cell.styles.halign = "center";
          data.cell.styles.fontStyle = "bold";
          const text = data.cell.raw;
          if (typeof text === "string" && text.startsWith("+")) {
            data.cell.styles.textColor = COLORS.above;
          } else if (typeof text === "string" && text.startsWith("-")) {
            data.cell.styles.textColor = COLORS.wellBelow;
          }
        }
      },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 12;

    // Class averages
    const avgRow = [];
    for (const p of periods) {
      const vals = sorted
        .map(({ scores }) => {
          const s = scores[p];
          if (!s) return null;
          let v = s[measure];
          if (measure === "composite" && v == null) v = s.mclass_composite;
          return v != null ? Number(v) : null;
        })
        .filter((v) => v != null);
      if (vals.length > 0) {
        avgRow.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
      } else {
        avgRow.push("—");
      }
    }

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.subheader);
    const avgText = periods.map((p, i) => `${p}: ${avgRow[i]}`).join("    ");
    doc.text(`Class Average — ${avgText}`, margin, y);
    y += 14;

    // Legend
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const legends = [
      { label: "Above", color: COLORS.above },
      { label: "At", color: COLORS.at },
      { label: "Below", color: COLORS.below },
      { label: "Well Below", color: COLORS.wellBelow },
    ];
    let lx = margin;
    for (const { label, color } of legends) {
      doc.setFillColor(...color);
      doc.rect(lx, y - 6, 8, 8, "F");
      doc.text(label, lx + 12, y);
      lx += doc.getTextWidth(label) + 24;
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Acadience Reading Tracker — Baymonte Christian School — Confidential",
      pageWidth / 2, pageHeight - 15,
      { align: "center" }
    );
  }

  // Page 1: Composite
  buildPage("Composite Growth", "composite", "Composite Score");

  // Page 2: ORF Words (only if applicable for this grade)
  const hasOrf = periods.some((p) => {
    const ms = getMeasuresForGradePeriod(grade, p);
    return ms && ms.includes("orf_words");
  });

  if (hasOrf) {
    doc.addPage();
    buildPage("ORF Growth", "orf_words", "Oral Reading Fluency (Words Correct)");
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Fluency Growth Report
// ---------------------------------------------------------------------------

/**
 * Draw the fluency growth chart (on-track goal line + summer bands +
 * student's actual score) into a jsPDF doc within the given rect. Mirrors
 * FluencyTrajectoryChart.jsx so the PDF and the on-screen chart always
 * agree on shape and values.
 */
function drawFluencyChart(doc, rect, points, actual) {
  const { x, y, width, height } = rect;
  const pad = { top: 20, right: 60, bottom: 22, left: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = points.length;

  const yMax = Math.max(110, ...actual.filter((v) => v != null).map((v) => Math.ceil((v + 10) / 10) * 10));
  const xFor = (i) => x + pad.left + (i / (n - 1)) * plotW;
  const yFor = (v) => y + pad.top + (1 - v / yMax) * plotH;

  // Summer bands
  doc.setFillColor(...COLORS.summerFill);
  points.forEach((p, i) => {
    if (!p.isSummerStart) return;
    doc.rect(xFor(i - 1), y + pad.top, xFor(i) - xFor(i - 1), plotH, "F");
  });
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.summerInk);
  points.forEach((p, i) => {
    if (!p.isSummerStart) return;
    doc.text("SUMMER", (xFor(i - 1) + xFor(i)) / 2, y + pad.top - 5, { align: "center" });
  });

  // Gridlines + y-axis ticks
  doc.setDrawColor(...COLORS.gridline);
  doc.setLineWidth(0.5);
  doc.setFontSize(7);
  [0, 20, 40, 60, 80, 100].forEach((t) => {
    doc.line(x + pad.left, yFor(t), x + width - pad.right, yFor(t));
    doc.setTextColor(...COLORS.tickText);
    doc.text(String(t), x + pad.left - 4, yFor(t), { align: "right", baseline: "middle" });
  });

  // X-axis labels
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.tickText);
  points.forEach((p, i) => {
    doc.text(p.label, xFor(i), y + height - pad.bottom + 9, { align: "center" });
  });

  // Goal line — dashed
  doc.setDrawColor(...COLORS.goalLine);
  doc.setLineWidth(1.3);
  doc.setLineDashPattern([2.5, 2], 0);
  for (let i = 1; i < n; i++) {
    doc.line(xFor(i - 1), yFor(points[i - 1].goalCwpm), xFor(i), yFor(points[i].goalCwpm));
  }
  doc.setLineDashPattern([], 0);

  // Actual-score line — solid, broken across real gaps in the data
  doc.setDrawColor(...COLORS.actualLine);
  doc.setLineWidth(1.6);
  let prevIdx = null;
  actual.forEach((v, i) => {
    if (v == null) return;
    if (prevIdx != null && i === prevIdx + 1) {
      doc.line(xFor(prevIdx), yFor(actual[prevIdx]), xFor(i), yFor(v));
    }
    prevIdx = i;
  });

  // Dots
  points.forEach((p, i) => {
    doc.setFillColor(...COLORS.goalLine);
    doc.circle(xFor(i), yFor(p.goalCwpm), 1.6, "F");
    if (actual[i] != null) {
      doc.setFillColor(...COLORS.actualLine);
      doc.circle(xFor(i), yFor(actual[i]), 2, "F");
    }
  });

  // End labels
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.setTextColor(...COLORS.subheader);
  doc.text(`Goal: ${Math.round(points[n - 1].goalCwpm)}`, x + width - pad.right + 4, yFor(points[n - 1].goalCwpm) - 2);
  const lastActualIdx = (() => {
    for (let i = actual.length - 1; i >= 0; i--) if (actual[i] != null) return i;
    return -1;
  })();
  if (lastActualIdx === n - 1) {
    doc.setTextColor(...COLORS.actualLine);
    doc.text(`${Math.round(actual[lastActualIdx])} cwpm`, x + width - pad.right + 4, yFor(actual[lastActualIdx]) + 10);
  }
  doc.setFont(undefined, "normal");

  // Legend
  const legendY = y + height + 12;
  doc.setLineDashPattern([2, 1.5], 0);
  doc.setDrawColor(...COLORS.goalLine);
  doc.setLineWidth(1.3);
  doc.line(x, legendY, x + 16, legendY);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.subheader);
  doc.text("On-track goal", x + 20, legendY, { baseline: "middle" });

  const legend2X = x + 20 + doc.getTextWidth("On-track goal") + 16;
  doc.setDrawColor(...COLORS.actualLine);
  doc.setLineWidth(1.6);
  doc.line(legend2X, legendY, legend2X + 16, legendY);
  doc.text("Actual score", legend2X + 20, legendY, { baseline: "middle" });

  return legendY + 10;
}

/**
 * Draw one student's Fluency Growth Report onto the doc's *current* page —
 * chart, comprehension summary table, overall indicator, footer. Shared by
 * the single-student report and the whole-class "one page per student"
 * report so both always render identically.
 */
function drawFluencyReportPage(doc, student, history, captiScores, iowaScores) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.header);
  doc.text("Acadience Reading — Fluency Growth Report", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text("Baymonte Christian School", margin, y);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 20;

  doc.setFontSize(14);
  doc.setTextColor(...COLORS.header);
  doc.text(`${student.first_name} ${student.last_name}`, margin, y);
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  const meta = [`ID: ${student.student_id}`];
  if (student.dob) meta.push(`DOB: ${student.dob}`);
  if (student.cohort_year) meta.push(`Cohort: ${student.cohort_year}`);
  doc.text(meta.join("  ·  "), margin, y);
  y += 16;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // --- Fluency chart ---
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.header);
  doc.text("Fluency Growth Chart", margin, y);
  y += 12;

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.subheader);
  const captionLines = doc.splitTextToSize(
    `Baymonte's goal: every student reads ${ON_TRACK_END.cwpm} correct words per minute (cwpm) by ` +
    `the end of Grade ${ON_TRACK_END.grade}, starting from about ${ON_TRACK_START.cwpm} cwpm at Grade 1 BOY — ` +
    `with end-of-year targets of ${GRADE_EOY_GOAL[1]} (G1), ${GRADE_EOY_GOAL[2]} (G2), and ${GRADE_EOY_GOAL[3]} (G3) ` +
    `along the way. The goal line holds flat across each summer. This is a planning target, not an Acadience benchmark cutoff.`,
    pageWidth - margin * 2
  );
  doc.text(captionLines, margin, y);
  y += captionLines.length * 10 + 10;

  const chartHeight = 230;
  const actual = getActualScores(ON_TRACK_TRAJECTORY, history || []);
  y = drawFluencyChart(doc, { x: margin, y, width: pageWidth - margin * 2, height: chartHeight }, ON_TRACK_TRAJECTORY, actual);
  y += 16;

  // --- Comprehension summary ---
  if (y > 620) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.header);
  doc.text("Comprehension — Most Recent Scores", margin, y);
  y += 6;

  const summary = getComprehensionSummary(history || [], captiScores || [], iowaScores || []);

  const compRows = [
    ["Iowa Assessments — Reading", summary.iowa],
    ["Capti ReadBasix — Reading Comprehension", summary.capti],
    ["Maze", summary.maze],
    ["Retell Quality of Response", summary.retell],
  ].map(([label, point]) => [
    label,
    point ? point.label : "—",
    point ? String(point.value) : "—",
    point?.risk ? point.risk.label : "No data",
  ]);

  autoTable(doc, {
    startY: y + 8,
    head: [["Measure", "Most Recent Period", "Score", "Rating"]],
    body: compRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: COLORS.lightGray, textColor: COLORS.subheader, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold" },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const point = [summary.iowa, summary.capti, summary.maze, summary.retell][data.row.index];
        if (point?.risk) {
          data.cell.styles.textColor = hexToRgb(point.risk.color);
        } else {
          data.cell.styles.textColor = [148, 163, 184];
        }
      }
    },
    theme: "grid",
  });

  y = doc.lastAutoTable.finalY + 18;

  // --- Overall indicator ---
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.header);
  doc.text("Overall Comprehension Indicator", margin, y);
  y += 14;

  if (summary.overall) {
    const badgeColor = hexToRgb(summary.overall.color);
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(margin, y - 12, 150, 24, 4, 4, "F");
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...COLORS.white);
    doc.text(summary.overall.label, margin + 75, y + 1, { align: "center", baseline: "middle" });
    doc.setFont(undefined, "normal");
    y += 24;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.subheader);
    doc.text("Not enough comprehension data yet for an overall indicator.", margin, y);
    y += 14;
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const activeWeights = getComprehensionWeights(summary.gradeNum);
  const weightParts = [
    ["Iowa", activeWeights.iowa],
    ["Capti", activeWeights.capti],
    ["Maze", activeWeights.maze],
    ["Retell Quality", activeWeights.retell],
  ]
    .filter(([, w]) => w != null)
    .map(([name, w]) => `${name} (${Math.round(w * 100)}%)`)
    .join(", ");
  const upperGradeNote = activeWeights.maze == null
    ? " Maze and Retell Quality are dropped from the overall starting Grade 5."
    : "";
  const weightLine = doc.splitTextToSize(
    `Weighted blend of whichever measures are on file — ${weightParts} — with missing measures ` +
    `left out and the rest reweighted.${upperGradeNote} Not an Acadience composite.`,
    pageWidth - margin * 2
  );
  doc.text(weightLine, margin, y);
  y += weightLine.length * 10;

  // Footer (current page only — callers looping over many students add a
  // new page per student, so a full-page-range footer loop would redraw
  // every prior page's footer again on each iteration)
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Acadience Reading Tracker — Baymonte Christian School — Confidential",
    pageWidth / 2, doc.internal.pageSize.getHeight() - 20,
    { align: "center" }
  );
}

/**
 * Fluency Growth Report — one student's fluency chart (on-track goal vs.
 * actual ORF score) plus a snapshot of their most recent comprehension
 * scores and the overall weighted comprehension indicator below it.
 */
export function generateFluencyReport(student, history, captiScores, iowaScores) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  drawFluencyReportPage(doc, student, history, captiScores, iowaScores);
  return doc;
}

/**
 * Same Fluency Growth Report as generateFluencyReport, but one page per
 * student for an entire class — a single print job covering the whole
 * roster instead of downloading each student separately.
 *
 * @param {Array<{ student, history, captiScores, iowaScores }>} roster
 */
export function generateClassFluencyReports(roster) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  roster.forEach((r, i) => {
    if (i > 0) doc.addPage();
    drawFluencyReportPage(doc, r.student, r.history, r.captiScores, r.iowaScores);
  });
  return doc;
}

// ---------------------------------------------------------------------------
// Teacher Dashboard
// ---------------------------------------------------------------------------

function studentName(student) {
  return `${student.last_name}, ${student.first_name}`;
}

/** "Well Below <34   ·   Below 34–49   ·   At 50–70   ·   Above 71+" from a
 * getThresholds() {above, at, risk} triple. */
function formatBenchmarkRanges(ref) {
  const parts = [];
  if (ref.risk != null) {
    parts.push(`Well Below < ${ref.risk}`);
    const belowUpper = (ref.at ?? ref.risk + 1) - 1;
    parts.push(`Below ${ref.risk}–${belowUpper}`);
  } else if (ref.at != null) {
    parts.push(`Below < ${ref.at}`);
  }
  if (ref.at != null) {
    const atUpper = ref.above != null ? ref.above - 1 : null;
    parts.push(`At ${ref.at}${atUpper != null ? `–${atUpper}` : "+"}`);
  }
  if (ref.above != null) {
    parts.push(`Above ${ref.above}+`);
  }
  return parts.join("   ·   ");
}

/**
 * Sort a { label -> [line, ...] } bucket set into the four RISK_LABEL tiers
 * and draw them as a single-row, four-column table: High Risk | Some Risk |
 * On Track | Advanced. Each cell lists one line per student (newline-
 * separated); an empty tier shows "—". Returns the y position below the
 * table.
 */
function drawRiskBucketTable(doc, startY, margin, pageWidth, buckets) {
  const head = [["High Risk", "Some Risk", "On Track", "Advanced"]];
  const cols = [buckets.highRisk, buckets.someRisk, buckets.onTrack, buckets.advanced];
  const body = [cols.map((lines) => (lines.length > 0 ? lines.join("\n") : "—"))];
  const headColors = [COLORS.wellBelow, COLORS.below, COLORS.at, COLORS.above];

  autoTable(doc, {
    startY,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 6, lineColor: [226, 232, 240], lineWidth: 0.5, valign: "top" },
    headStyles: { fontStyle: "bold", halign: "center", textColor: COLORS.white, fontSize: 9 },
    columnStyles: { 0: { cellWidth: (pageWidth - margin * 2) / 4 } },
    didParseCell: (data) => {
      if (data.section === "head") {
        data.cell.styles.fillColor = headColors[data.column.index];
      }
      if (data.section === "body" && cols[data.column.index].length === 0) {
        data.cell.styles.textColor = [203, 213, 225];
        data.cell.styles.halign = "center";
      }
    },
    theme: "grid",
  });

  return doc.lastAutoTable.finalY;
}

function pushToRiskBucket(buckets, risk, line) {
  if (!risk) return false;
  if (risk.label === RISK_LABEL.AT_HIGH_RISK.label) buckets.highRisk.push(line);
  else if (risk.label === RISK_LABEL.AT_SOME_RISK.label) buckets.someRisk.push(line);
  else if (risk.label === RISK_LABEL.ON_TRACK.label) buckets.onTrack.push(line);
  else if (risk.label === RISK_LABEL.ADVANCED.label) buckets.advanced.push(line);
  else return false;
  return true;
}

/**
 * Teacher Dashboard — a whole class sorted into risk tiers, two ways:
 *
 *   1. Fluency: each student's ORF Words Correct for the selected
 *      reporting period, bucketed by that period's Acadience benchmark,
 *      with the benchmark's cut scores printed above for reference.
 *   2. Comprehension: each student's Overall Comprehension Indicator
 *      (the same weighted composite as the Comprehension Tracker/Fluency
 *      Growth Report) — names only, since it's a blend of several
 *      differently-scaled measures rather than one score.
 *
 * @param {object} classInfo - { class_id, teacher, grade }
 * @param {string} grade
 * @param {string} period - "BOY" | "MOY" | "EOY"
 * @param {string} year - school year, e.g. "2025-2026"
 * @param {Array<{ student, score }>} fluencyRows - getClassScores() for this period
 * @param {Array<{ student, overall }>} comprehensionRows - each student's current overall indicator
 */
export function generateTeacherDashboard(classInfo, grade, period, year, fluencyRows, comprehensionRows) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.header);
  doc.text("Teacher Dashboard", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text("Baymonte Christian School", margin, y);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 18;

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.header);
  doc.text(
    `${year}  ·  ${period}  ·  ${GRADE_LABELS[grade] || "Grade " + grade}  ·  ${classInfo.teacher || ""} (${classInfo.class_id || ""})`,
    margin, y
  );
  y += 16;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // --- Fluency ---
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Fluency — Oral Reading Fluency (Words Correct)", margin, y);
  y += 16;

  const orfRef = getThresholds(grade, period, "orf_words");
  if (!orfRef) {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.subheader);
    doc.text(`Oral Reading Fluency isn't assessed at ${GRADE_LABELS[grade] || "Grade " + grade} ${period}.`, margin, y);
    y += 20;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.subheader);
    doc.text(`Benchmark for ${GRADE_LABELS[grade] || "Grade " + grade} ${period}:  ${formatBenchmarkRanges(orfRef)}`, margin, y);
    y += 16;

    const fBuckets = { highRisk: [], someRisk: [], onTrack: [], advanced: [] };
    const fNoScore = [];
    for (const { student, score } of fluencyRows) {
      const val = score?.orf_words;
      if (val == null) {
        fNoScore.push(studentName(student));
        continue;
      }
      const status = getScoreStatus(grade, period, "orf_words", val, score);
      const risk = benchmarkStatusToRiskLabel(status);
      const line = `${studentName(student)} — ${formatScore(val)}`;
      if (!pushToRiskBucket(fBuckets, risk, line)) fNoScore.push(studentName(student));
    }

    y = drawRiskBucketTable(doc, y, margin, pageWidth, fBuckets) + 10;

    if (fNoScore.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      const lines = doc.splitTextToSize(`No ORF score this period: ${fNoScore.join("; ")}`, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 10 + 10;
    }
  }

  // --- Comprehension ---
  if (y > 560) {
    doc.addPage();
    y = margin;
  } else {
    y += 10;
  }

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Comprehension — Overall Indicator", margin, y);
  y += 14;

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.subheader);
  const compCaption = doc.splitTextToSize(
    "Weighted blend of each student's most recent Iowa, Capti, Maze, and Retell Quality scores (Iowa and Capti " +
    "only from Grade 5 up) — not tied to this reporting period, and not an Acadience composite.",
    pageWidth - margin * 2
  );
  doc.text(compCaption, margin, y);
  y += compCaption.length * 10 + 8;

  const cBuckets = { highRisk: [], someRisk: [], onTrack: [], advanced: [] };
  const cNoData = [];
  for (const { student, overall } of comprehensionRows) {
    if (!pushToRiskBucket(cBuckets, overall, studentName(student))) cNoData.push(studentName(student));
  }

  y = drawRiskBucketTable(doc, y, margin, pageWidth, cBuckets) + 10;

  if (cNoData.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const lines = doc.splitTextToSize(`Not enough comprehension data yet: ${cNoData.join("; ")}`, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 10;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Acadience Reading Tracker — Baymonte Christian School — Confidential",
      pageWidth / 2, doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Grade 1 Reading Risk Report
// ---------------------------------------------------------------------------

/**
 * Draw one student's Grade 1 Reading Risk Report onto the doc's *current*
 * page — overall risk indicator, subtest-by-subtest breakdown with
 * plain-language notes on how each predicts later reading success, and an
 * intervention + progress-monitoring recommendation.
 */
function drawGrade1ReportPage(doc, student, grade, period, year, scoreRow, localCompositeValues) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.header);
  doc.text("Grade 1 Reading Risk Report", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text("Baymonte Christian School", margin, y);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 20;

  doc.setFontSize(14);
  doc.setTextColor(...COLORS.header);
  doc.text(`${student.first_name} ${student.last_name}`, margin, y);
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  const meta = [`ID: ${student.student_id}`];
  if (student.dob) meta.push(`DOB: ${student.dob}`);
  meta.push(`${year} · ${period} · ${GRADE_LABELS[grade] || "Grade " + grade}`);
  doc.text(meta.join("  ·  "), margin, y);
  y += 16;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const assessment = buildGrade1Assessment(grade, period, scoreRow, localCompositeValues);

  // --- Overall Risk Indicator ---
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Overall Risk Indicator", margin, y);
  y += 16;

  if (assessment.compositeRisk) {
    const c = hexToRgb(assessment.compositeRisk.color);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.roundedRect(margin, y - 12, 130, 22, 4, 4, "F");
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...COLORS.white);
    doc.text(assessment.compositeRisk.label, margin + 65, y - 1, { align: "center", baseline: "middle" });
    doc.setFont(undefined, "normal");
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.subheader);
    doc.text("No composite score on file this period.", margin, y);
  }
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.subheader);
  const compositeLine = assessment.composite != null
    ? `Composite: ${formatScore(assessment.composite)} — ${assessment.compositeStatus?.status || "no benchmark data"}`
    : "Composite: not yet scored this period.";
  doc.text(compositeLine, margin, y);
  y += 13;

  if (assessment.localPercentile != null) {
    const n = (localCompositeValues || []).filter((v) => v != null).length;
    doc.text(
      `Ranks in the ${ordinal(assessment.localPercentile)} percentile among this year's Grade 1 ${period} students at Baymonte (n=${n}).`,
      margin, y
    );
    y += 13;
  }
  y += 8;

  // --- Subtest Breakdown ---
  if (y > 560) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Subtest Breakdown", margin, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.subheader);
  doc.text("How each measure relates to later reading success:", margin, y);
  y += 14;

  for (const s of assessment.subtests) {
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...COLORS.header);
    doc.text(s.name, margin, y);

    const valueText = s.value != null ? formatScore(s.value) : "—";
    const statusText = s.hasBenchmark ? (s.status?.status || "no score") : "no benchmark — risk indicator";
    const rightColor = s.risk ? hexToRgb(s.risk.color) : COLORS.subheader;
    doc.setFontSize(9);
    doc.setTextColor(rightColor[0], rightColor[1], rightColor[2]);
    doc.text(`${valueText}   ·   ${statusText}`, pageWidth - margin, y, { align: "right" });
    doc.setFont(undefined, "normal");
    y += 12;

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.subheader);
    const lines = doc.splitTextToSize(s.note, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 10 + 10;
  }

  // --- Recommendation ---
  if (y > 600) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Recommendation", margin, y);
  y += 16;

  const rec = assessment.recommendation;
  const recColor = hexToRgb(rec.risk.color);
  doc.setFillColor(recColor[0], recColor[1], recColor[2]);
  doc.roundedRect(margin, y - 12, 150, 24, 4, 4, "F");
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.setTextColor(...COLORS.white);
  doc.text(rec.level, margin + 75, y + 1, { align: "center", baseline: "middle" });
  doc.setFont(undefined, "normal");

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.header);
  const freqText = rec.days > 0
    ? `${rec.days} day${rec.days === 1 ? "" : "s"}/week, 30 min, Orton-Gillingham`
    : "No formal intervention recommended";
  doc.text(freqText, margin + 160, y + 1, { baseline: "middle" });
  y += 26;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.subheader);
  const reasonLines = doc.splitTextToSize(getRecommendationReasoning(assessment), pageWidth - margin * 2);
  doc.text(reasonLines, margin, y);
  y += reasonLines.length * 11 + 10;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.header);
  doc.text("Progress Monitoring:", margin, y);
  y += 12;
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.subheader);
  const pmLines = doc.splitTextToSize(assessment.pmPlan.text, pageWidth - margin * 2);
  doc.text(pmLines, margin, y);
  y += pmLines.length * 10;

  // Footer (current page only — see drawFluencyReportPage for why)
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Acadience Reading Tracker — Baymonte Christian School — Confidential",
    pageWidth / 2, doc.internal.pageSize.getHeight() - 20,
    { align: "center" }
  );
}

/**
 * Grade 1 Reading Risk Report for one student.
 *
 * @param {object} student
 * @param {string} grade - "1" (Kindergarten EOY planned for later)
 * @param {string} period - "BOY" | "MOY" | "EOY"
 * @param {string} year
 * @param {object|null} scoreRow - this student's score row for the period
 * @param {Array<number>} localCompositeValues - every Grade 1 student's
 *   composite score this year/period (whole school), for the percentile
 */
export function generateGrade1Report(student, grade, period, year, scoreRow, localCompositeValues) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  drawGrade1ReportPage(doc, student, grade, period, year, scoreRow, localCompositeValues);
  return doc;
}

/**
 * Same report as generateGrade1Report, one page per student, for an entire
 * class — a single print job for the whole homeroom.
 *
 * @param {Array<{ student, score }>} roster - e.g. getClassScores() rows
 */
export function generateClassGrade1Reports(grade, period, year, roster, localCompositeValues) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  roster.forEach(({ student, score }, i) => {
    if (i > 0) doc.addPage();
    drawGrade1ReportPage(doc, student, grade, period, year, score, localCompositeValues);
  });
  return doc;
}

/**
 * Grade 1 Teacher Dashboard — the homeroom sorted into the same four risk
 * tiers as generateTeacherDashboard, but driven by the Composite Score
 * (and each student's percentile within the whole Grade 1 cohort) rather
 * than ORF, since Grade 1 doesn't have fluency/comprehension measures the
 * way Grades 2+ do.
 *
 * @param {object} classInfo - { class_id, teacher, grade }
 * @param {Array<{ student, score }>} classRows - this homeroom, e.g. getClassScores()
 * @param {Array<{ student, score }>} gradeRows - whole Grade 1, e.g. getGradeScores() — the percentile peer group
 */
export function generateGrade1TeacherDashboard(classInfo, grade, period, year, classRows, gradeRows) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFontSize(18);
  doc.setTextColor(...COLORS.header);
  doc.text("Grade 1 Teacher Dashboard", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.subheader);
  doc.text("Baymonte Christian School", margin, y);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 18;

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.header);
  doc.text(
    `${year}  ·  ${period}  ·  Grade 1  ·  ${classInfo.teacher || ""} (${classInfo.class_id || ""})`,
    margin, y
  );
  y += 16;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.header);
  doc.text("Reading Risk — Composite Score", margin, y);
  y += 16;

  const compRef = getThresholds(grade, period, "composite");
  if (compRef) {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.subheader);
    doc.text(`Benchmark for ${GRADE_LABELS[grade] || "Grade " + grade} ${period}:  ${formatBenchmarkRanges(compRef)}`, margin, y);
    y += 16;
  }

  const gradeCompositeValues = (gradeRows || []).map((r) => r.score?.composite).filter((v) => v != null);

  const buckets = { highRisk: [], someRisk: [], onTrack: [], advanced: [] };
  const noScore = [];
  for (const { student, score } of classRows) {
    const composite = score?.composite;
    if (composite == null) {
      noScore.push(studentName(student));
      continue;
    }
    // Reuse the individual report's logic so the dashboard bucket always
    // matches that student's Grade 1 Reading Risk Report — including the
    // BOY worst-of-composite-and-ORF rule.
    const assessment = buildGrade1Assessment(grade, period, score, gradeCompositeValues);
    const pct = assessment.localPercentile;
    const line = `${studentName(student)} — ${formatScore(composite)}${pct != null ? ` (${ordinal(pct)} %ile)` : ""}`;
    if (!pushToRiskBucket(buckets, assessment.recommendation.risk, line)) noScore.push(studentName(student));
  }

  y = drawRiskBucketTable(doc, y, margin, pageWidth, buckets) + 10;

  if (noScore.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const lines = doc.splitTextToSize(`No composite score this period: ${noScore.join("; ")}`, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 10 + 10;
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const noteLines = doc.splitTextToSize(
    "Buckets reflect the recommended intervention level (Strong = 4 days/week, Moderate = 2 days/week, Monitor/" +
    "None = no formal intervention), which factors in both the national composite benchmark and how each student " +
    "compares to this year's whole Grade 1 cohort at Baymonte — see each student's Grade 1 Reading Risk Report " +
    "for the full breakdown and reasoning. Intervention model: Orton-Gillingham, 30 minutes per session.",
    pageWidth - margin * 2
  );
  doc.text(noteLines, margin, y);
  y += noteLines.length * 10;

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Acadience Reading Tracker — Baymonte Christian School — Confidential",
      pageWidth / 2, doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  return doc;
}
