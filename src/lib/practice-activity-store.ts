import { createHash } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { calculateExamReadiness, calculateTopicPerformance } from "@/lib/practice-analytics";
import type { AttemptSummary, ExamQuestion } from "@/types/exam";
import type { MockPerformance, PracticeActivity, PracticeProgress } from "@/types/practice";

const practiceKind = "practice_progress";
const examKind = "exam_activity";

export async function loadPracticeActivity(participantId: string, questions: ExamQuestion[]): Promise<PracticeActivity> {
  const { tables } = createAdminClient();
  const [practiceRows, examRows] = await Promise.all([
    tables.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.attemptsCollectionId,
      queries: [
        Query.equal("kind", [practiceKind]),
        Query.equal("lookup", [participantId]),
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
  };
}

export async function recordPracticeAttempt(
  participantId: string,
  question: ExamQuestion,
  isCorrect: boolean,
  attemptedAt: string,
) {
  const { tables } = createAdminClient();
  const rowId = stableRowId("practice", participantId, question.id);
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

  const progress: PracticeProgress = {
    questionId: question.id,
    topic: question.topic,
    subtopic: question.subtopic,
    totalAttempts: (existing?.totalAttempts ?? 0) + 1,
    correctAttempts: (existing?.correctAttempts ?? 0) + (isCorrect ? 1 : 0),
    lastAttemptedAt: attemptedAt,
    previousCorrect: isCorrect,
    recentAttempts: [...(existing?.recentAttempts ?? []), { attemptedAt, correct: isCorrect }].slice(-10),
  };
  const data = {
    kind: practiceKind,
    lookup: participantId,
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

function stableRowId(scope: string, participantId: string, questionId: string) {
  const digest = createHash("sha256").update(`${scope}:${participantId}:${questionId}`).digest("hex");
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
