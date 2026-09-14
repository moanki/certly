import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PDFParse } from "pdf-parse";
import { extractLooseQuestionsFromText } from "../src/lib/importers";
import { extractColoredAnswerHintsByPage } from "../src/lib/pdf-color-answers";
import type { ExamQuestion } from "../src/types/exam";

type ExplanationEntry = {
  id: string;
  question: string;
  correctOptionLabels: string[];
  explanation: string;
};

type Correction = {
  id: string;
  question?: string;
  correctOptionLabels?: string[];
  optionTextByLabel?: Record<string, string>;
};

async function main() {
  const inputPaths = process.argv.slice(2);
  if (!inputPaths.length) throw new Error("Pass one or more source PDF paths.");

  const explanationFiles = [
  "01-smartli-ups-basic.json",
  "02-ups2000-ups5000.json",
  "03-cooling-fusionmodule.json",
  "04-fusiondc-ecc-neteco.json",
  "05-comprehensive-001-062.json",
  "06-comprehensive-063-124.json",
  "07-comprehensive-125-186.json",
  "08-comprehensive-187-248.json",
  ];
  const explanations = (await Promise.all(explanationFiles.map(async (fileName) =>
    JSON.parse(await readFile(resolve("data/explanations", fileName), "utf8")) as ExplanationEntry[]))).flat();
  const corrections = JSON.parse(await readFile(resolve("data/question-corrections.json"), "utf8")) as Correction[];
  const explanationByQuestion = new Map(explanations.map((entry) => [normalize(entry.question), entry]));
  const explanationById = new Map(explanations.map((entry) => [entry.id, entry]));
  const correctionById = new Map(corrections.map((entry) => [entry.id, entry]));
  const sourceCorrectionIdByQuestion = new Map([
    [normalize("If a fire occurs in the FUsionModule1000, the gas release indicator will display ‘Done enter while releasing gas’."), "6aa2e58100204fd64f91"],
    [normalize("The cycle life of the battery is direct proportional to the depth of discharge."), "6aa2e585001119fd9cf9"],
    [normalize("When the NetCol5000-A indoor unit and the outdoor unit are not installed separately, the refrigerant line is ()."), "6aa2e58700035bf99cbb"],
    [normalize("The basic principle of infrared humidifier is to boil water and then generates steam."), "6aa2e5780022c0ac296c"],
    [normalize("The number of battery strings for the UPS5000-A can be adjusted to avoid replacing the whole battery string due to one battery and solve the battery maintenance difficulty of traditional UPSs."), "6aa2e5760026d7160c4f"],
  ]);
  const sourceExplanationByQuestion = new Map([
    [normalize("The default battery charge voltage of the UPS2000-G is () volt/cell."), "B is correct: the UPS2000-G default equalized-charging setting referenced here is 2.35 V per lead-acid cell. Expressing the value per cell allows the UPS to calculate the required voltage for the complete battery string. This setting is higher than the normal float level so it can correct charge imbalance under controlled conditions. It must still match the selected battery type, temperature-compensation settings, and manufacturer guidance; an unsuitable voltage can undercharge the string or accelerate water loss, heating, and aging."],
  ]);
  const questions: ExamQuestion[] = [];
  let matchedExplanations = 0;

  for (const inputPath of inputPaths) {
  const bytes = new Uint8Array(await readFile(inputPath));
  const parser = new PDFParse({ data: bytes.slice() });
  const fileName = basename(inputPath);
  try {
    const parsed = await parser.getText();
    const hints = await extractColoredAnswerHintsByPage(bytes);
    for (const [pageIndex, page] of parsed.pages.entries()) {
      const previews = extractLooseQuestionsFromText(page.text, hints[pageIndex] ?? []);
      for (const preview of previews) {
        const normalizedQuestion = normalize(preview.question);
        const correctionId = sourceCorrectionIdByQuestion.get(normalizedQuestion);
        const explanation = explanationByQuestion.get(normalizedQuestion) ?? (correctionId ? explanationById.get(correctionId) : undefined);
        if (explanation) matchedExplanations += 1;
        const id = explanation?.id ?? `fallback-${createHash("sha256").update(normalizedQuestion).digest("hex").slice(0, 24)}`;
        const correction = correctionById.get(id);
        const correctLabels = correction?.correctOptionLabels ?? explanation?.correctOptionLabels ?? preview.answer.split(",").map((label) => label.trim().toUpperCase()).filter(Boolean);
        const correctSet = new Set(correctLabels);
        const options = preview.options.map((text, index) => {
          const label = String.fromCharCode(65 + index);
          return {
            id: label.toLowerCase(),
            label,
            text: correction?.optionTextByLabel?.[label] ?? text,
            isCorrect: correctSet.has(label),
          };
        });
        if (options.length < 2 || !correctLabels.length || correctLabels.some((label) => !options.some((option) => option.label === label))) continue;
        const questionText = correction?.question ?? preview.question;
        questions.push({
          id,
          certificationId: "hcip-dcf",
          examVersion: "HCIP-DCF imported mock",
          topic: topicForFile(fileName),
          subtopic: topicForFile(fileName),
          difficulty: "intermediate",
          type: options.length === 2 && options.every((option) => /^(?:true|false)$/i.test(option.text)) ? "true_false" : correctLabels.length > 1 ? "multiple" : "single",
          text: questionText,
          options,
          explanation: explanation?.explanation || preview.explanation || sourceExplanationByQuestion.get(normalizedQuestion) || "Review the marked answer and the relevant HCIP-DCF course material.",
          sourceType: "mock_exam",
          sourceReference: `${fileName} - PDF page ${pageIndex + 1}`,
        });
      }
    }
  } finally {
    await parser.destroy();
  }
  }

  const unique = [...new Map(questions.map((question) => [normalize(question.text), question])).values()];
  await writeFile(resolve("src/lib/static-question-bank.json"), `${JSON.stringify(unique, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ parsed: questions.length, unique: unique.length, matchedExplanations }));
}

void main();

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function topicForFile(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("d8")) return "ECC800 / NetEco";
  if (normalized.includes("d7")) return "FusionDC 1000";
  if (normalized.includes("d6")) return "FusionModule 2000";
  if (normalized.includes("d5")) return "Cooling";
  if (normalized.includes("d4")) return "UPS5000";
  if (normalized.includes("d3")) return "UPS2000";
  if (normalized.includes("d2")) return "UPS Basic";
  if (normalized.includes("d1")) return "SmartLi";
  return "HCIP-DCF Comprehensive";
}
