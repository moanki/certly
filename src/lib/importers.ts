import Papa from "papaparse";
import { coerceImportRows } from "@/lib/exam-engine";
import type { ImportPreviewQuestion } from "@/types/exam";

export function parseCsvImport(content: string): ImportPreviewQuestion[] {
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return coerceImportRows(parsed.data);
}

export function extractLooseQuestionsFromText(text: string, colorAnswerHints: string[][] = []): ImportPreviewQuestion[] {
  const normalized = text
    .replaceAll("\u00a0", " ")
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+((?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\).:-]\s+)/gi, "$1\n$2")
    .replace(/\s+([A-H])\s*[\).:-]\s+(?=\S)/g, "\n$1. ")
    .replace(/\s+((?:correct\s+)?answer\s*[:.-]\s*)/gi, "\n$1")
    .replace(/\s+(explanation\s*[:.-]\s*)/gi, "\n$1");

  const blocks = normalized
    .split(/(?=^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\).:-]\s+)/gim)
    .map((block) => block.trim())
    .filter((block) => block.length > 20);
  let colorHintIndex = 0;

  return blocks.flatMap((block, index) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const questionLines: string[] = [];
    const options: string[] = [];
    let answer = "";
    let explanation = "";
    let section: "question" | "options" | "explanation" = "question";

    for (const line of lines) {
      const optionMatch = line.match(/^([A-H])\s*[\).:-]\s*(.+)/i);
      const answerMatch = line.match(/^(?:answer|correct answer)\s*[:.-]?\s*(.+)/i);
      const explanationMatch = line.match(/^explanation\s*[:.-]?\s*(.*)/i);

      if (answerMatch) {
        answer = answerMatch[1];
        section = "options";
      } else if (explanationMatch) {
        explanation = explanationMatch[1];
        section = "explanation";
      } else if (optionMatch && !answer) {
        options.push(optionMatch[2].trim());
        section = "options";
      } else if (section === "explanation") {
        explanation = `${explanation} ${line}`.trim();
      } else if (section === "options" && options.length > 0 && !answer) {
        options[options.length - 1] = `${options[options.length - 1]} ${line}`.trim();
      } else if (!answer) {
        questionLines.push(line.replace(/^(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s*/i, ""));
      }
    }

    if (options.length < 2 && /^(?:true|false)$/i.test(answer.trim())) {
      options.splice(0, options.length, "True", "False");
    }
    const colorHint = options.length >= 2 ? colorAnswerHints[colorHintIndex++] : [];
    answer = normalizePdfAnswer(answer || colorHint?.join(",") || "", options);
    const question = questionLines.join(" ").replace(/\s+/g, " ").trim();
    if (question.length < 5 || options.length < 2 || !answer) return [];

    const normalizedOptions = options.map((option) => option.replace(/\s+/g, " ").trim());
    const isTrueFalse = normalizedOptions.length === 2
      && normalizedOptions.every((option) => /^(?:true|false)$/i.test(option));

    return [{
      topic: "Unassigned",
      subtopic: "PDF import review",
      type: isTrueFalse ? "true_false" : answer.includes(",") ? "multiple" : "single",
      question,
      options: normalizedOptions,
      answer,
      explanation: explanation.replace(/\s+/g, " ").trim(),
      sourceReference: `PDF block ${index + 1}`,
    }];
  });
}

function normalizePdfAnswer(raw: string, options: string[]) {
  const value = raw.trim();
  if (/^(?:true|false)$/i.test(value)) {
    const optionIndex = options.findIndex((option) => option.trim().toLowerCase() === value.toLowerCase());
    return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "";
  }

  const cleaned = value
    .toUpperCase()
    .replace(/\bOPTIONS?\b/g, "")
    .replace(/\bAND\b/g, ",")
    .replace(/[()[\]{}]/g, " ")
    .trim();
  const compact = cleaned.replace(/[\s,;|/]+/g, "");
  if (!/^[A-H]+$/.test(compact)) return "";
  return [...new Set(compact)].join(",");
}
