import { createHash } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { calculateExamReadiness, calculateTopicPerformance } from "@/lib/practice-analytics";
import type { AttemptSummary, ExamQuestion } from "@/types/exam";
import type { MockPerformance, PracticeActivity, PracticeAttemptKind, PracticeProgress } from "@/types/practice";

const practiceKind = "practice_progress";
const examKind = "exam_activity";

export async function loadPracticeActivity(participantId: string, questions: ExamQuestion[], practiceSessionId?: string): Promise<PracticeActivity> {
  const { tables } = createAdminClient();
  const lookup = practiceSessionId ? practiceLookup(participantId, practiceSessionId) : participantId;
  const [practiceRows, examRows] = await Promise.all([
    tables.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      queries: [
        Query.equal("kind", [practiceKind]),
        Query.equal("lookup", [lookup]),
        Query.orderDesc("occurredAt"),
        Query.limit(500),
      ],
    }),
    tables.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      queries: [
        Query.equal("kind", [examKind]),
        Query.equal("lookup", [participantId]),
        Query.orderDesc("occurredAt"),
        Query.limit(3),
      ],
    }),
  ]);

  const progress = practiceRows.rows.flatMap((row) => parseProgress(row.payloadJson));
  const mockPerformance = examRows.rows.flatMap((row) => parseMockPerformance(row.payloadJson));
  const topicPerformance = calculateTopicPerformance(progress, questions);
  const topicRecommendations = topicPerformance.topics.some((topic) => topic.mastery !== null)
    ? [...topicPerformance.topics]
      .filter((topic) => topic.mastery !== null)
      .sort((left, right) => (left.mastery ?? 0) - (right.mastery ?? 0))
      .slice(0, 3)
      .map((topic) => topic.weakestSubtopics[0] ? `${topic.topic}: ${topic.weakestSubtopics[0].name}` : topic.topic)
    : undefined;
  return {
    historyByQuestion: Object.fromEntries(progress.map((item) => [item.questionId, {
      totalAttempts: item.totalAttempts,
      correctAttempts: item.correctAttempts,
      lastAttemptedAt: item.lastAttemptedAt,
      previousCorrect: item.previousCorrect,
    }])),
    readiness: calculateExamReadiness(progress, mockPerformance, questions.length, topicRecommendations),
    topicPerformance,
    session: summarizeSession(practiceSessionId ?? "legacy", progress, questions.length),
    sessionProgress: progress.map((item) => ({
      questionId: item.questionId,
      blockNumber: item.blockNumber ?? 1,
      firstAttemptCorrect: item.firstAttemptCorrect ?? item.previousCorrect,
      reinforcementAttempts: item.reinforcementAttempts ?? 0,
      reinforcementCorrect: item.reinforcementCorrect ?? 0,
      reviewAttempts: item.reviewAttempts ?? 0,
      previousCorrect: item.previousCorrect,
    })),
  };
}

export async function recordPracticeAttempt(
  participantId: string,
  question: ExamQuestion,
  isCorrect: boolean,
  attemptedAt: string,
  context: {
    practiceSessionId?: string;
    displayName?: string;
    attemptKind?: PracticeAttemptKind;
    blockNumber?: number;
  } = {},
) {
  const { tables } = createAdminClient();
  const rowId = context.practiceSessionId
    ? stableRowId("practice", participantId, context.practiceSessionId, question.id)
    : stableRowId("practice", participantId, question.id);
  let existing: PracticeProgress | null = null;
  try {
    const row = await tables.getRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      rowId,
    });
    existing = parseProgress(row.payloadJson)[0] ?? null;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const attemptKind: PracticeAttemptKind = existing
    ? context.attemptKind === "review" ? "review" : "reinforcement"
    : "initial";
  const progress: PracticeProgress = {
    questionId: question.id,
    topic: question.topic,
    subtopic: question.subtopic,
    totalAttempts: (existing?.totalAttempts ?? 0) + 1,
    correctAttempts: (existing?.correctAttempts ?? 0) + (isCorrect ? 1 : 0),
    lastAttemptedAt: attemptedAt,
    previousCorrect: isCorrect,
    recentAttempts: [...(existing?.recentAttempts ?? []), { attemptedAt, correct: isCorrect, kind: attemptKind }].slice(-10),
    candidateName: context.displayName?.trim() || existing?.candidateName,
    candidateEmail: existing?.candidateEmail,
    learnerId: participantId,
    practiceSessionId: context.practiceSessionId ?? existing?.practiceSessionId,
    blockNumber: existing?.blockNumber ?? context.blockNumber ?? 1,
    firstAttemptCorrect: existing?.firstAttemptCorrect ?? isCorrect,
    firstAttemptedAt: existing?.firstAttemptedAt ?? attemptedAt,
    reinforcementAttempts: (existing?.reinforcementAttempts ?? 0) + (attemptKind === "reinforcement" ? 1 : 0),
    reinforcementCorrect: (existing?.reinforcementCorrect ?? 0) + (attemptKind === "reinforcement" && isCorrect ? 1 : 0),
    reviewAttempts: (existing?.reviewAttempts ?? 0) + (attemptKind === "review" ? 1 : 0),
  };
  const data = {
    kind: practiceKind,
    lookup: context.practiceSessionId ? practiceLookup(participantId, context.practiceSessionId) : participantId,
    status: isCorrect ? "correct" : "incorrect",
    occurredAt: attemptedAt,
    payloadJson: JSON.stringify(progress),
  };

  if (existing) {
    await tables.updateRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      rowId,
      data,
    });
  } else {
    await tables.createRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      rowId,
      data,
    });
  }
}

export async function recordExamActivity(participantId: string, summary: AttemptSummary, attemptedAt: string) {
  const { tables } = createAdminClient();
  const payload: MockPerformance = { percent: summary.percent, attemptedAt };
  await tables.createRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.attemptsCollectionId,
    rowId: ID.unique(),
    data: {
      kind: examKind,
      lookup: participantId,
      status: summary.passed ? "passed" : "failed",
      occurredAt: attemptedAt,
      payloadJson: JSON.stringify(payload),
    },
  });
}

function stableRowId(scope: string, ...parts: string[]) {
  const digest = createHash("sha256").update([scope, ...parts].join(":" )).digest("hex");
  return `pp_${digest.slice(0, 29)}`;
}

function parseProgress(value: unknown): PracticeProgress[] {
  try {
    const item = JSON.parse(String(value)) as PracticeProgress;
    if (!item || typeof item.questionId !== "string" || typeof item.topic !== "string" || typeof item.subtopic !== "string") return [];
    if (!Number.isInteger(item.totalAttempts) || item.totalAttempts < 1 || !Number.isInteger(item.correctAttempts) || item.correctAttempts < 0) return [];
    if (item.correctAttempts > item.totalAttempts || typeof item.lastAttemptedAt !== "string" || typeof item.previousCorrect !== "boolean") return [];
    item.recentAttempts = Array.isArray(item.recentAttempts)
      ? item.recentAttempts.filter((attempt) => attempt && typeof attempt.attemptedAt === "string" && typeof attempt.correct === "boolean").slice(-10)
      : [{ attemptedAt: item.lastAttemptedAt, correct: item.previousCorrect }];
    return [item];
  } catch {
    return [];
  }
}

function summarizeSession(sessionId: string, progress: PracticeProgress[], totalQuestions: number) {
  const uniqueQuestions = progress.length;
  const totalAttempts = progress.reduce((total, item) => total + item.totalAttempts, 0);
  const firstCorrect = progress.filter((item) => item.firstAttemptCorrect ?? item.previousCorrect).length;
  const initiallyWrong = progress.filter((item) => !(item.firstAttemptCorrect ?? item.previousCorrect));
  const blockNumber = progress.length ? Math.max(...progress.map((item) => item.blockNumber ?? 1)) : 1;
  const blockProgress = progress.filter((item) => (item.blockNumber ?? 1) === blockNumber);
  const blockCorrect = blockProgress.filter((item) => item.firstAttemptCorrect ?? item.previousCorrect).length;
  return {
    id: sessionId,
    startedAt: progress.length
      ? [...progress].sort((left, right) => Date.parse(left.firstAttemptedAt ?? left.lastAttemptedAt) - Date.parse(right.firstAttemptedAt ?? right.lastAttemptedAt))[0]?.firstAttemptedAt ?? progress[0].lastAttemptedAt
      : null,
    uniqueQuestions,
    totalAttempts,
    score: uniqueQuestions ? Math.round((firstCorrect / uniqueQuestions) * 100) : null,
    initiallyWrong: initiallyWrong.length,
    reinforcementAttempts: progress.reduce((total, item) => total + (item.reinforcementAttempts ?? 0), 0),
    successfullyReinforced: initiallyWrong.filter((item) => (item.reinforcementCorrect ?? 0) >= 3).length,
    stillStruggling: initiallyWrong.filter((item) => !item.previousCorrect).length,
    blockNumber,
    blockUniqueQuestions: blockProgress.length,
    blockTarget: Math.min(100, Math.max(0, totalQuestions - (blockNumber - 1) * 100)),
    blockScore: blockProgress.length ? Math.round((blockCorrect / blockProgress.length) * 100) : null,
    blockInitiallyWrong: blockProgress.length - blockCorrect,
  };
}

function practiceLookup(participantId: string, practiceSessionId: string) {
  return `${participantId}:${practiceSessionId}`;
}

function parseMockPerformance(value: unknown): MockPerformance[] {
  try {
    const item = JSON.parse(String(value)) as MockPerformance;
    if (!item || !Number.isFinite(item.percent) || item.percent < 0 || item.percent > 100 || typeof item.attemptedAt !== "string") return [];
    return [item];
  } catch {
    return [];
  }
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 404);
}
