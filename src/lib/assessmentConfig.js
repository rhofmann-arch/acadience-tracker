/**
 * Assessment configuration for the Assessment Manager.
 *
 * Maps grade/period/subtest to:
 *   - Administration reminders (brief instructions for the assessor)
 *   - Timing rules
 *   - Score entry fields and constraints
 *   - Links to printable materials (to be populated with Acadience PDFs)
 */

import { MEASURE_SCHEDULE } from "./scoringEngine.js";

// ---------------------------------------------------------------------------
// Administration reminders per subtest
// ---------------------------------------------------------------------------
export const SUBTEST_INFO = {
  fsf: {
    name: "First Sound Fluency",
    abbrev: "FSF",
    timing: "1 minute",
    scoreUnit: "first sounds correct",
    directions:
      "Say each word aloud. Student says the first sound. Score correct first sounds in 1 minute.",
    tips: "Accept phoneme only (not letter name). If student says the whole word, redirect once.",
  },
  lnf: {
    name: "Letter Naming Fluency",
    abbrev: "LNF",
    timing: "1 minute",
    scoreUnit: "letters named correctly",
    directions:
      "Student names as many upper- and lowercase letters as possible in 1 minute.",
    tips: "Score letter NAMES, not sounds. Mark skipped letters as errors. Note: risk indicator only — no benchmark goal.",
  },
  psf: {
    name: "Phoneme Segmentation Fluency",
    abbrev: "PSF",
    timing: "1 minute",
    scoreUnit: "correct phonemes",
    directions:
      "Say each word. Student segments it into individual phonemes. Score total correct phonemes in 1 minute.",
    tips: "Accept any correct segmentation. 'cat' → /k/ /æ/ /t/ = 3 correct phonemes.",
  },
  nwf_cls: {
    name: "Nonsense Word Fluency — Correct Letter Sounds",
    abbrev: "NWF-CLS",
    timing: "1 minute",
    scoreUnit: "correct letter sounds",
    directions:
      "Student reads nonsense words. Score total correct letter sounds in 1 minute (including sounds in whole words read correctly).",
    tips: "If student reads 'sig' as a whole word correctly, score 3 CLS. Don't penalize for reading whole vs. sound-by-sound.",
  },
  nwf_wwr: {
    name: "Nonsense Word Fluency — Whole Words Read",
    abbrev: "NWF-WWR",
    timing: "1 minute (same passage as NWF-CLS)",
    scoreUnit: "whole words read correctly",
    directions:
      "From the same NWF passage, count how many nonsense words the student read as whole words (recoded).",
    tips: "Only count words read as a unit, not sounded out letter-by-letter then blended.",
  },
  orf_words: {
    name: "Oral Reading Fluency — Words Correct",
    abbrev: "ORF",
    timing: "1 minute",
    scoreUnit: "words read correctly per minute",
    directions:
      "Student reads a grade-level passage aloud for 1 minute. Score total words read correctly.",
    tips: "Mark errors (substitutions, omissions, hesitations > 3 sec). Self-corrections within 3 seconds are scored correct.",
  },
  orf_accuracy: {
    name: "Oral Reading Fluency — Accuracy",
    abbrev: "ORF Accuracy",
    timing: "Calculated from ORF passage",
    scoreUnit: "percentage",
    directions:
      "Accuracy % = words correct ÷ words attempted × 100. Calculated automatically from ORF words correct and errors.",
    tips: "Enter as a whole number (e.g., 94 for 94%). If entering manually, round to nearest whole percent.",
    calculated: true,
  },
  retell: {
    name: "Retell",
    abbrev: "Retell",
    timing: "1 minute",
    scoreUnit: "words in retell",
    directions:
      "After the ORF passage, say 'Please tell me all about what you just read.' Score total relevant words in 1 minute.",
    tips: "Count only words that relate to the passage. Do not count off-topic words. Do not administer if ORF < 40 words correct.",
  },
  retell_quality: {
    name: "Retell Quality of Response",
    abbrev: "Retell Quality",
    timing: "N/A — scored after retell",
    scoreUnit: "1, 2, or 3",
    directions:
      "Rate the quality of the retell: 1 = limited/off-topic, 2 = adequate, 3 = detailed with main ideas and supporting details.",
    tips: "Score 1–3 only. This is a judgment call based on the overall retell, not a word count.",
    validRange: [1, 3],
  },
  maze: {
    name: "Maze",
    abbrev: "Maze",
    timing: "3 minutes",
    scoreUnit: "adjusted score",
    directions:
      "Student silently reads a passage with missing words. For each blank, student selects the correct word from 3 choices. Maze adjusted score = correct − (incorrect ÷ 2).",
    tips: "Score = correct choices − (incorrect choices ÷ 2). Can result in half-point values (e.g., 12.5). This is a group-administered measure.",
  },
};

// ---------------------------------------------------------------------------
// Printable material links (to be populated with actual paths/URLs)
// ---------------------------------------------------------------------------
export const PRINTABLE_MATERIALS = {
  // Structure: grade → period → URL or local path
  // Populate these as PDF files are organized
  // Example:
  // "1": {
  //   "BOY": "/materials/AcadienceReading_K-6_Benchmark_Student_G1.pdf",
  // },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the subtests and their info for a grade/period assessment session.
 */
export function getAssessmentSession(grade, period) {
  const measures = MEASURE_SCHEDULE[grade]?.[period];
  if (!measures) return null;

  return measures.map((measure) => ({
    measure,
    ...SUBTEST_INFO[measure],
  }));
}

/**
 * Get printable material URL for a grade/period.
 */
export function getPrintableMaterial(grade, period) {
  return PRINTABLE_MATERIALS[grade]?.[period] || null;
}

/**
 * Validate a score value for a given subtest.
 * Returns { valid: boolean, error?: string }.
 */
export function validateScore(measure, value) {
  if (value === "" || value == null) {
    return { valid: true }; // blank is OK (not administered)
  }

  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, error: "Must be a number" };
  }

  const info = SUBTEST_INFO[measure];
  if (info?.validRange) {
    const [min, max] = info.validRange;
    if (num < min || num > max) {
      return { valid: false, error: `Must be between ${min} and ${max}` };
    }
  }

  if (measure === "orf_accuracy") {
    if (num < 0 || num > 100) {
      return { valid: false, error: "Must be 0–100%" };
    }
  }

  if (num < 0) {
    return { valid: false, error: "Cannot be negative" };
  }

  return { valid: true };
}
