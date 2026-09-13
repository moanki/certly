import { createHash } from "node:crypto";
import type { AdminPerformanceDashboard, AdminPerformancePoint, AdminScoreboard, AdminScoreboardEntry } from "@/types/admin";

export type PerformanceRecordRow = {
  $id: string;
  lookup: string;
  occurredAt: string;
  payloadJson: unknown;
};

type PracticePayload = {
  questionId: string;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptedAt: string;
  previousCorrect: boolean;
  recentAttempts: Array<{ attemptedAt: string; correct: boolean; kind?: string }>;
  candidateName?: string;
  learnerId?: string;
  practiceSessionId?: string;
  firstAttemptCorrect?: boolean;
  firstAttemptedAt?: string;
};

type ExamPayload = {
  candidateName: string;
  candidateEmail: string;
  participantId?: string;
  submittedAt: string;
  score: number;
  total: number;
  questionKeys: string[];
};

type PerformanceGroup = {
  key: string;
  name: string;
  identityAt: string;
  startedAt: string;
  latestAttemptedAt: string;
  questionsAttempted: number;
  correctAttempts: number;
  scoredAttempts: number;
  uniqueQuestions: Set<string>;
  scores: Array<{ attemptedAt: string; score: number }>;
};

export function buildAdminPerformance(
  examRows: PerformanceRecordRow[],
  practiceRows: PerformanceRecordRow[],
  examActivityRows: PerformanceRecordRow[] = [],
): AdminPerformanceDashboard {
  const participantNames = linkParticipantNames(examRows, examActivityRows);
  return {
    practice: buildPracticeScoreboard(practiceRows, participantNames),
    exam: buildExamScoreboard(examRows),
  };
}

export function fingerprintQuestion(questionId: string) {
  return createHash("sha256").update(questionId).digest("hex").slice(0, 10);
}

function buildPracticeScoreboard(rows: PerformanceRecordRow[], participantNames: Map<string, { name: string; attemptedAt: string }>): AdminScoreboard {
  const groups = new Map<string, PerformanceGroup>();
  for (const row of rows) {
    const payload = parsePracticePayload(row.payloadJson);
    if (!payload) continue;
    const learnerId = payload.learnerId ?? row.lookup.split(":")[0];
    const key = payload.practiceSessionId
      ? `practice:${learnerId}:${payload.practiceSessionId}`
      : `practice-legacy:${row.lookup}`;
    const linkedIdentity = participantNames.get(learnerId);
    const group = getGroup(groups, key, payload.candidateName ?? linkedIdentity?.name, linkedIdentity?.attemptedAt ?? row.occurredAt);
    if (payload.candidateName && timestamp(row.occurredAt) >= timestamp(group.identityAt)) {
      group.name = payload.candidateName;
      group.identityAt = row.occurredAt;
    }
    group.startedAt = earlierDate(group.startedAt, payload.firstAttemptedAt ?? payload.lastAttemptedAt);
    group.latestAttemptedAt = laterDate(group.latestAttemptedAt, payload.lastAttemptedAt);
    group.questionsAttempted += payload.totalAttempts;
    group.correctAttempts += payload.firstAttemptCorrect === undefined ? payload.correctAttempts : payload.firstAttemptCorrect ? 1 : 0;
    group.scoredAttempts += payload.firstAttemptCorrect === undefined ? payload.totalAttempts : 1;
    group.uniqueQuestions.add(payload.questionId);
    group.scores.push(...(payload.firstAttemptCorrect === undefined
      ? payload.recentAttempts.map((attempt) => ({ attemptedAt: attempt.attemptedAt, score: attempt.correct ? 1 : 0 }))
      : [{ attemptedAt: payload.firstAttemptedAt ?? payload.lastAttemptedAt, score: payload.firstAttemptCorrect ? 1 : 0 }]));
  }

  return finalizeScoreboard(groups, 100, (group) => percent(group.correctAttempts, group.scoredAttempts), true);
}

function linkParticipantNames(examRows: PerformanceRecordRow[], activityRows: PerformanceRecordRow[]) {
  const result = new Map<string, { name: string; attemptedAt: string }>();
  const attemptsByTimestamp = new Map<string, ExamPayload[]>();
  for (const row of examRows) {
    const attempt = parseExamPayload(row.payloadJson);
    if (!attempt) continue;
    attemptsByTimestamp.set(attempt.submittedAt, [...(attemptsByTimestamp.get(attempt.submittedAt) ?? []), attempt]);
    if (attempt.participantId) result.set(attempt.participantId, { name: attempt.candidateName, attemptedAt: attempt.submittedAt });
  }
  for (const row of activityRows) {
    const activity = parseExamActivity(row.payloadJson);
    if (!activity) continue;
    const attempt = (attemptsByTimestamp.get(activity.attemptedAt) ?? []).find((candidate) => Math.round(candidate.score / 10) === activity.percent);
    if (!attempt) continue;
    const existing = result.get(row.lookup);
    if (!existing || timestamp(activity.attemptedAt) > timestamp(existing.attemptedAt)) {
      result.set(row.lookup, { name: attempt.candidateName, attemptedAt: activity.attemptedAt });
    }
  }
  return result;
}

function buildExamScoreboard(rows: PerformanceRecordRow[]): AdminScoreboard {
  const groups = new Map<string, PerformanceGroup>();
  for (const row of rows) {
    const payload = parseExamPayload(row.payloadJson);
    if (!payload) continue;
    const key = payload.candidateEmail
      ? `email:${payload.candidateEmail}`
      : payload.participantId
        ? `participant:${payload.participantId}`
        : `name:${payload.candidateName.toLowerCase()}`;
    const group = getGroup(groups, key, payload.candidateName, payload.submittedAt);
    if (timestamp(payload.submittedAt) >= timestamp(group.identityAt)) {
      group.name = payload.candidateName;
      group.identityAt = payload.submittedAt;
    }
    group.latestAttemptedAt = laterDate(group.latestAttemptedAt, payload.submittedAt);
    group.startedAt = earlierDate(group.startedAt, payload.submittedAt);
    group.questionsAttempted += payload.total;
    payload.questionKeys.forEach((questionKey) => group.uniqueQuestions.add(questionKey));
    group.scores.push({ attemptedAt: payload.submittedAt, score: payload.score });
  }

  return finalizeScoreboard(groups, 1_000, (group) => Math.max(...group.scores.map((attempt) => attempt.score)), false);
}

function finalizeScoreboard(
  groups: Map<string, PerformanceGroup>,
  scoreScale: number,
  scoreFor: (group: PerformanceGroup) => number,
  cumulativePractice: boolean,
): AdminScoreboard {
  const leaders: AdminScoreboardEntry[] = [...groups.values()].map((group) => ({
    userId: publicUserId(group.key),
    name: group.name,
    startedAt: group.startedAt,
    latestAttemptedAt: group.latestAttemptedAt,
    questionsAttempted: group.questionsAttempted,
    uniqueQuestionsAttempted: group.uniqueQuestions.size,
    totalScore: scoreFor(group),
    completedAttempts: group.scores.length,
  })).sort((left, right) => right.totalScore - left.totalScore
    || right.questionsAttempted - left.questionsAttempted
    || left.name.localeCompare(right.name));
  const rank = new Map(leaders.map((leader, index) => [leader.userId, index]));
  const series = [...groups.values()].map((group) => {
    const attempts = [...group.scores].sort((left, right) => timestamp(left.attemptedAt) - timestamp(right.attemptedAt));
    let correct = 0;
    const points: AdminPerformancePoint[] = attempts.map((attempt, index) => {
      correct += attempt.score;
      return {
        attemptedAt: attempt.attemptedAt,
        attemptNumber: index + 1,
        score: cumulativePractice ? percent(correct, index + 1) : attempt.score,
      };
    });
    return { userId: publicUserId(group.key), name: group.name, points };
  }).sort((left, right) => (rank.get(left.userId) ?? 0) - (rank.get(right.userId) ?? 0));

  return { scoreScale, leaders, series };
}

function getGroup(groups: Map<string, PerformanceGroup>, key: string, candidateName: string | undefined, identityAt: string) {
  const existing = groups.get(key);
  if (existing) return existing;
  const group: PerformanceGroup = {
    key,
    name: cleanName(candidateName) ?? `Anonymous learner ${publicUserId(key).slice(-4).toUpperCase()}`,
    identityAt,
    startedAt: identityAt,
    latestAttemptedAt: identityAt,
    questionsAttempted: 0,
    correctAttempts: 0,
    scoredAttempts: 0,
    uniqueQuestions: new Set(),
    scores: [],
  };
  groups.set(key, group);
  return group;
}

function parsePracticePayload(value: unknown): PracticePayload | null {
  try {
    const item = JSON.parse(String(value)) as Partial<PracticePayload>;
    if (typeof item.questionId !== "string" || !positiveInteger(item.totalAttempts) || !nonNegativeInteger(item.correctAttempts)) return null;
    if ((item.correctAttempts ?? 0) > (item.totalAttempts ?? 0) || !validDate(item.lastAttemptedAt) || typeof item.previousCorrect !== "boolean") return null;
    const recentAttempts = Array.isArray(item.recentAttempts)
      ? item.recentAttempts.filter((attempt) => attempt && validDate(attempt.attemptedAt) && typeof attempt.correct === "boolean").slice(-10)
      : [{ attemptedAt: item.lastAttemptedAt as string, correct: item.previousCorrect }];
    return {
      questionId: item.questionId,
      totalAttempts: item.totalAttempts as number,
      correctAttempts: item.correctAttempts as number,
      lastAttemptedAt: item.lastAttemptedAt as string,
      previousCorrect: item.previousCorrect,
      recentAttempts,
      candidateName: cleanName(item.candidateName),
      learnerId: typeof item.learnerId === "string" && /^[a-f0-9]{32}$/.test(item.learnerId) ? item.learnerId : undefined,
      practiceSessionId: typeof item.practiceSessionId === "string" && /^[a-f0-9]{32}$/.test(item.practiceSessionId) ? item.practiceSessionId : undefined,
      firstAttemptCorrect: typeof item.firstAttemptCorrect === "boolean" ? item.firstAttemptCorrect : undefined,
      firstAttemptedAt: validDate(item.firstAttemptedAt) ? item.firstAttemptedAt : undefined,
    };
  } catch {
    return null;
  }
}

function parseExamPayload(value: unknown): ExamPayload | null {
  try {
    const item = JSON.parse(String(value)) as Partial<ExamPayload> & { answers?: Array<{ questionId?: unknown }> };
    const candidateName = cleanName(item.candidateName);
    if (!candidateName || !validDate(item.submittedAt) || !boundedNumber(item.score, 0, 1_000) || !positiveInteger(item.total)) return null;
    const candidateEmail = typeof item.candidateEmail === "string" ? item.candidateEmail.trim().toLowerCase().slice(0, 254) : "";
    const participantId = typeof item.participantId === "string" && /^[a-f0-9]{32}$/.test(item.participantId) ? item.participantId : undefined;
    const storedKeys = Array.isArray(item.questionKeys) ? item.questionKeys.filter((key) => typeof key === "string" && /^[a-f0-9]{10}$/.test(key)) : [];
    const answerKeys = Array.isArray(item.answers)
      ? item.answers.flatMap((answer) => typeof answer?.questionId === "string" ? [fingerprintQuestion(answer.questionId)] : [])
      : [];
    return {
      candidateName,
      candidateEmail,
      participantId,
      submittedAt: item.submittedAt as string,
      score: Math.round(item.score as number),
      total: item.total as number,
      questionKeys: storedKeys.length ? storedKeys : answerKeys,
    };
  } catch {
    return null;
  }
}

function parseExamActivity(value: unknown) {
  try {
    const item = JSON.parse(String(value)) as { percent?: unknown; attemptedAt?: unknown };
    if (!boundedNumber(item.percent, 0, 100) || !validDate(item.attemptedAt)) return null;
    return { percent: Math.round(item.percent), attemptedAt: item.attemptedAt };
  } catch {
    return null;
  }
}

function publicUserId(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const name = value.trim().replace(/\s+/g, " ");
  return name ? name.slice(0, 128) : undefined;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100))) : 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function laterDate(left: string, right: string) {
  return timestamp(right) > timestamp(left) ? right : left;
}

function earlierDate(left: string, right: string) {
  return timestamp(right) < timestamp(left) ? right : left;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
