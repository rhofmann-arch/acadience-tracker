/**
 * PDF report generation for Acadience Reading Tracker.
 *
 * Reports:
 *   1. Student Longitudinal Report — one page per student
 *   2. Classroom Snapshot — printable class roster with scores
 *   3. Classroom Growth Report — BOY/MOY/EOY composite and ORF side by side
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getBenchmarkStatus,
  getMeasuresForGradePeriod,
  mclassLevelToStatus,
  STATUS,
} from "./scoringEngine";

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
};

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
};

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
export function generateStudentReport(student, history) {
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
    if (!byYear[row.school_year]) byYear[row.school_year] = [];
    byYear[row.school_year].push(row);
  }

  // --- Score tables per year ---
  for (const [year, rows] of Object.entries(byYear)) {
    const grade = rows[0].grade;

    // Check if we need a new page
    if (y > 650) {
      doc.addPage();
      y = margin;
    }

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
