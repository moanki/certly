import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client, Query, TablesDB } from "node-appwrite";

const config = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1",
  apiKey: process.env.APPWRITE_ADMIN_API_KEY ?? process.env.APPWRITE_API_KEY,
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "certly",
  tableId: process.env.APPWRITE_QUESTIONS_COLLECTION_ID ?? "questions",
};

if (!config.apiKey) throw new Error("APPWRITE_ADMIN_API_KEY or APPWRITE_API_KEY is required.");

const apply = process.argv.includes("--apply");
const explanationsDirectory = path.resolve("data", "explanations");
const correctionsPath = path.resolve("data", "question-corrections.json");
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
const tables = new TablesDB(client);
const rows = await loadActiveRows();
const entries = await loadExplanationEntries();
const corrections = JSON.parse(await readFile(correctionsPath, "utf8"));
const validated = validateEntries(rows, entries, corrections);

console.log(`Validated ${validated.length} explanations for ${rows.length} active questions.`);
if (!apply) {
  console.log("Dry run complete. Re-run with --apply to update Appwrite.");
  process.exit(0);
}

const backupDirectory = path.resolve(".explanation-work");
await mkdir(backupDirectory, { recursive: true });
const backupPath = path.join(backupDirectory, `questions-before-explanations-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(backupPath, JSON.stringify(rows.map((row) => ({ id: row.$id, payloadJson: row.payloadJson })), null, 2));
console.log(`Backup written to ${backupPath}`);

const explanationById = new Map(validated.map((entry) => [entry.id, entry.explanation]));
const correctionById = new Map(corrections.map((correction) => [correction.id, correction]));
const expectedPayloadById = new Map(rows.map((row) => {
  const payload = applyCorrection(JSON.parse(String(row.payloadJson)), correctionById.get(row.$id));
  payload.explanation = explanationById.get(row.$id);
  return [row.$id, JSON.stringify(payload)];
}));
for (let offset = 0; offset < rows.length; offset += 10) {
  await Promise.all(rows.slice(offset, offset + 10).map(async (row) => {
    const payloadJson = expectedPayloadById.get(row.$id);
    if (payloadJson.length > 15_000) throw new Error(`Question ${row.$id} exceeds the Appwrite payload limit.`);
    await tables.updateRow({
      databaseId: config.databaseId,
      tableId: config.tableId,
      rowId: row.$id,
      data: { payloadJson },
    });
  }));
  console.log(`Updated ${Math.min(offset + 10, rows.length)} of ${rows.length}.`);
}

const updatedRows = await loadActiveRows();
const verified = updatedRows.filter((row) => String(row.payloadJson) === expectedPayloadById.get(row.$id));
if (verified.length !== rows.length) throw new Error(`Post-write verification failed: ${verified.length} of ${rows.length} rows match.`);
console.log(`Appwrite verification passed for all ${verified.length} questions.`);

async function loadActiveRows() {
  const loaded = [];
  for (let offset = 0; ; offset += 500) {
    const page = await tables.listRows({
      databaseId: config.databaseId,
      tableId: config.tableId,
      queries: [Query.equal("status", ["active"]), Query.limit(500), Query.offset(offset)],
    });
    loaded.push(...page.rows);
    if (page.rows.length < 500) return loaded;
  }
}

async function loadExplanationEntries() {
  const files = (await readdir(explanationsDirectory)).filter((file) => /^\d{2}-.+\.json$/.test(file)).sort();
  if (files.length === 0) throw new Error(`No explanation files found in ${explanationsDirectory}.`);
  const loaded = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(path.join(explanationsDirectory, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array.`);
    loaded.push(...parsed.map((entry) => ({ ...entry, sourceFile: file })));
  }
  return loaded;
}

function validateEntries(activeRows, explanationEntries, questionCorrections) {
  const errors = [];
  const warnings = [];
  const rowById = new Map(activeRows.map((row) => [row.$id, row]));
  const correctionById = new Map();
  for (const correction of questionCorrections) {
    if (!correction || typeof correction.id !== "string" || correctionById.has(correction.id)) {
      errors.push(`Invalid or duplicate question correction ID ${correction?.id ?? "missing"}.`);
      continue;
    }
    if (!rowById.has(correction.id)) errors.push(`Question correction ${correction.id} does not target an active row.`);
    correctionById.set(correction.id, correction);
  }
  const seen = new Set();

  for (const entry of explanationEntries) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) {
      errors.push(`${entry?.sourceFile ?? "unknown"}: invalid or duplicate question ID ${entry?.id ?? "missing"}.`);
      continue;
    }
    seen.add(entry.id);
    const row = rowById.get(entry.id);
    if (!row) {
      errors.push(`${entry.sourceFile}: question ${entry.id} is not active in Appwrite.`);
      continue;
    }
    const payload = applyCorrection(JSON.parse(String(row.payloadJson)), correctionById.get(entry.id));
    const correctLabels = payload.options.filter((option) => option.isCorrect).map((option) => option.label).sort();
    const suppliedLabels = Array.isArray(entry.correctOptionLabels) ? [...entry.correctOptionLabels].sort() : [];
    if (entry.question !== payload.text) errors.push(`${entry.sourceFile}: question text mismatch for ${entry.id}.`);
    if (JSON.stringify(correctLabels) !== JSON.stringify(suppliedLabels)) errors.push(`${entry.sourceFile}: correct-answer mismatch for ${entry.id}.`);
    if (entry.needsReview) {
      if (typeof entry.reviewNote !== "string" || !entry.reviewNote.trim()) {
        errors.push(`${entry.sourceFile}: ${entry.id} is marked for review without a review note.`);
      } else {
        warnings.push(`${entry.sourceFile}: ${entry.id}: ${entry.reviewNote}`);
      }
    }
    if (typeof entry.explanation !== "string") {
      errors.push(`${entry.sourceFile}: ${entry.id} has no explanation.`);
      continue;
    }
    const words = entry.explanation.trim().split(/\s+/).filter(Boolean).length;
    if (words < 90 || words > 180) errors.push(`${entry.sourceFile}: ${entry.id} explanation has ${words} words; expected 90-180.`);
    const isBooleanQuestion = payload.options.length === 2
      && payload.options.some((option) => /^true\b/i.test(option.text))
      && payload.options.some((option) => /^(?:false|fales)\b/i.test(option.text));
    const namesEveryAnswer = payload.type === "true_false" || isBooleanQuestion
      ? payload.options.filter((option) => option.isCorrect).every((option) => new RegExp(`\\b${escapeRegExp(booleanAnswerTerm(option.text))}\\b`, "i").test(entry.explanation))
      : suppliedLabels.every((label) => new RegExp(`\\b${escapeRegExp(label)}\\b`).test(entry.explanation));
    if (!namesEveryAnswer) errors.push(`${entry.sourceFile}: ${entry.id} explanation does not name every correct answer.`);
  }

  for (const row of activeRows) {
    if (!seen.has(row.$id)) errors.push(`Missing explanation for active question ${row.$id}.`);
  }
  if (errors.length > 0) throw new Error(`Explanation validation failed (${errors.length} errors):\n${errors.slice(0, 100).join("\n")}`);
  if (warnings.length > 0) console.warn(`Explanation review warnings (${warnings.length}):\n${warnings.join("\n")}`);
  return explanationEntries;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function booleanAnswerTerm(value) {
  if (/^true\b/i.test(value)) return "True";
  if (/^(?:false|fales)\b/i.test(value)) return "False";
  return value;
}

function applyCorrection(payload, correction) {
  if (!correction) return payload;
  const corrected = structuredClone(payload);
  if (typeof correction.question === "string") corrected.text = correction.question;
  if (correction.optionTextByLabel) {
    corrected.options = corrected.options.map((option) => ({
      ...option,
      text: correction.optionTextByLabel[option.label] ?? option.text,
    }));
  }
  if (Array.isArray(correction.correctOptionLabels)) {
    const correctLabels = new Set(correction.correctOptionLabels);
    corrected.options = corrected.options.map((option) => ({ ...option, isCorrect: correctLabels.has(option.label) }));
  }
  return corrected;
}
