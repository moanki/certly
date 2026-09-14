import type { AttemptAnswer, ExamDraft, TemporaryExamResult } from "@/types/exam";

export function parseExamDraft(raw: string | null): ExamDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ExamDraft>;
    if (!value.candidate || typeof value.candidate.name !== "string" || typeof value.candidate.email !== "string") return null;
    if (typeof value.timed !== "boolean" || !validDate(value.startedAt)) return null;
    if (!Array.isArray(value.questionIds) || value.questionIds.length < 1 || value.questionIds.length > 500) return null;
    if (value.questionIds.some((id) => typeof id !== "string" || id.length > 64) || new Set(value.questionIds).size !== value.questionIds.length) return null;
    if (!Number.isInteger(value.questionIndex) || Number(value.questionIndex) < 0 || Number(value.questionIndex) >= value.questionIds.length) return null;
    if (!Array.isArray(value.answers) || !Array.isArray(value.marked)) return null;
    if (value.answers.some((answer) => !validAnswer(answer)) || value.marked.some((id) => typeof id !== "string" || !value.questionIds?.includes(id))) return null;
    if (value.deadlineAt !== null && (!Number.isFinite(value.deadlineAt) || Number(value.deadlineAt) <= 0)) return null;
    if (!boundedInteger(value.remainingSeconds, 0, 24 * 60 * 60)) return null;
    if (value.pausedAt !== null && !validDate(value.pausedAt)) return null;
    if (!boundedInteger(value.pausedDurationSeconds, 0, 24 * 60 * 60)) return null;
    if (!Number.isFinite(value.questionOpenedAt) || Number(value.questionOpenedAt) <= 0) return null;
    return value as ExamDraft;
  } catch {
    return null;
  }
}

export function parseTemporaryExamResult(raw: string | null): TemporaryExamResult | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TemporaryExamResult>;
    const summary = value.summary;
    if (!summary || !boundedInteger(summary.score, 0, 1_000) || !boundedInteger(summary.total, 1, 500)) return null;
    if (!Array.isArray(summary.results) || summary.results.length !== summary.total || !Array.isArray(summary.byTopic)) return null;
    return { summary, saveStatus: typeof value.saveStatus === "string" ? value.saveStatus.slice(0, 200) : "Result restored for this browser session." };
  } catch {
    return null;
  }
}

function validAnswer(value: unknown): value is AttemptAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<AttemptAnswer>;
  return typeof answer.questionId === "string"
    && Array.isArray(answer.selectedOptionIds)
    && answer.selectedOptionIds.every((id) => typeof id === "string")
    && Number.isFinite(answer.timeSpentSeconds)
    && typeof answer.markedForReview === "boolean";
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
