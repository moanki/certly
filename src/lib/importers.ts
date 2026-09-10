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

export function extractLooseQuestionsFromText(text: string): ImportPreviewQuestion[] {
  const blocks = text
    .split(/\n\s*(?=(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s+)/i)
    .map((block) => block.trim())
    .filter((block) => block.length > 20);

  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const questionLines: string[] = [];
    const options: string[] = [];
    let answer = "";
    let explanation = "";

    for (const line of lines) {
      const optionMatch = line.match(/^([A-F])[\).:-]\s+(.+)/i);
      const answerMatch = line.match(/^(answer|correct answer)[:\s]+(.+)/i);
      const explanationMatch = line.match(/^(explanation)[:\s]+(.+)/i);

      if (optionMatch) {
        options.push(optionMatch[2]);
      } else if (answerMatch) {
        answer = answerMatch[2];
      } else if (explanationMatch) {
        explanation = explanationMatch[2];
      } else if (!answer) {
        questionLines.push(line.replace(/^(?:Q(?:uestion)?\.?\s*)?\d+[\).:-]\s*/i, ""));
      }
    }

    return {
      topic: "Unassigned",
      subtopic: "PDF import review",
      type: answer.includes(",") || answer.includes(";") ? "multiple" : "single",
      question: questionLines.join(" "),
      options,
      answer,
      explanation,
      sourceReference: `PDF block ${index + 1}`,
    };
  });
}
