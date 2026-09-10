import { ID, Query } from "node-appwrite";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { hcipHuaweiPreset, normalizeQuestionCount, scoreAttempt } from "@/lib/exam-engine";
import { loadActiveQuestions } from "@/lib/question-store";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson, securityLog } from "@/lib/security";
import type { AttemptAnswer, Candidate, ExamQuestion } from "@/types/exam";

type AttemptPayload = {
  candidate?: Candidate;
  certificationId?: string;
  mode?: "exam" | "practice";
  timed?: boolean;
  startedAt?: string;
  submittedAt?: string;
  questionIds?: string[];
  answers?: AttemptAnswer[];
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
    if (email && email.length > 254) return noStoreJson({ error: "Invalid email filter." }, { status: 400 });

    const { databases } = createAdminClient();
    const queries = [Query.orderDesc("submittedAt"), Query.limit(50)];
    if (email) queries.unshift(Query.equal("candidateEmail", [email]));
    const result = await databases.listDocuments({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.attemptsCollectionId,
      queries,
    });
    return noStoreJson({
      attempts: result.documents.map((document) => ({
        id: document.$id,
        candidateName: document.candidateName,
        candidateEmail: document.candidateEmail,
        submittedAt: document.submittedAt,
        score: document.score,
        passed: document.passed,
        correct: document.correct,
        total: document.total,
        durationSeconds: document.durationSeconds,
      })),
    });
  } catch {
    return noStoreJson({ error: "Admin sign-in is required." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, 128 * 1024);
  if (sizeError) return sizeError;
  const rateLimitError = enforceRateLimit(request, "attempt-submit", 20, 60 * 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  try {
    const payload = (await request.json()) as AttemptPayload;
    const validationError = validateAttempt(payload);
    if (validationError) return noStoreJson({ error: validationError }, { status: 400 });

    const allQuestions = await loadActiveQuestions();
    const questionById = new Map(allQuestions.map((question) => [question.id, question]));
    const questionIds = payload.questionIds as string[];
    const expectedCount = normalizeQuestionCount(allQuestions.length, hcipHuaweiPreset.questionCount);
    if (questionIds.length !== expectedCount || new Set(questionIds).size !== questionIds.length) {
      return noStoreJson({ error: "The submitted exam question set is invalid." }, { status: 400 });
    }
    const questions = questionIds.map((id) => questionById.get(id));
    if (questions.some((question) => !question)) {
      return noStoreJson({ error: "The submitted exam question set is invalid." }, { status: 400 });
    }

    const answers = sanitizeAnswers(payload.answers as AttemptAnswer[], questionById);
    if (!answers) return noStoreJson({ error: "One or more submitted answers are invalid." }, { status: 400 });
    const summary = scoreAttempt(questions.flatMap((question) => question ? [question] : []), answers);
    const startedAt = new Date(payload.startedAt as string);
    const submittedAt = new Date(payload.submittedAt as string);
    const durationSeconds = Math.max(0, Math.min(24 * 60 * 60, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1_000)));

    let attemptId: string | null = null;
    let saved = false;
    try {
      const { databases } = createAdminClient();
      const candidate = payload.candidate as Candidate;
      const attempt = await databases.createDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.attemptsCollectionId,
        documentId: ID.unique(),
        data: {
          candidateName: candidate.name.trim(),
          candidateEmail: candidate.email.trim().toLowerCase(),
          certificationId: payload.certificationId,
          mode: payload.mode,
          timed: payload.timed,
          startedAt: startedAt.toISOString(),
          submittedAt: submittedAt.toISOString(),
          score: summary.score,
          passed: summary.passed,
          correct: summary.correct,
          incorrect: summary.incorrect,
          unanswered: summary.unanswered,
          total: summary.total,
          durationSeconds,
        },
      });
      attemptId = attempt.$id;
      await Promise.all(answers.map((answer) => databases.createDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.answersCollectionId,
        documentId: ID.unique(),
        data: {
          attemptId: attempt.$id,
          ...answer,
          isCorrect: summary.results.find((result) => result.question.id === answer.questionId)?.isCorrect ?? false,
        },
      })));
      saved = true;
    } catch {
      securityLog("attempt_persistence_failed");
    }

    return noStoreJson({ attemptId, saved, summary }, { status: 201 });
  } catch {
    return noStoreJson({ error: "The attempt could not be scored." }, { status: 400 });
  }
}

function validateAttempt(payload: AttemptPayload) {
  const candidate = payload.candidate;
  if (!candidate || typeof candidate.name !== "string" || candidate.name.trim().length < 1 || candidate.name.trim().length > 128) {
    return "Candidate data is invalid.";
  }
  if (typeof candidate.email !== "string" || candidate.email.length > 254) return "Candidate data is invalid.";
  if (payload.certificationId !== hcipHuaweiPreset.certificationId || payload.mode !== "exam" || typeof payload.timed !== "boolean") {
    return "Exam data is invalid.";
  }
  if (!isValidDate(payload.startedAt) || !isValidDate(payload.submittedAt)) return "Exam timestamps are invalid.";
  if (new Date(payload.submittedAt).getTime() < new Date(payload.startedAt).getTime()) return "Exam timestamps are invalid.";
  if (!Array.isArray(payload.questionIds) || payload.questionIds.length > hcipHuaweiPreset.questionCount) return "Exam question data is invalid.";
  if (payload.questionIds.some((id) => typeof id !== "string" || id.length > 64)) return "Exam question data is invalid.";
  if (!Array.isArray(payload.answers) || payload.answers.length > hcipHuaweiPreset.questionCount) return "Answer data is invalid.";
  return null;
}

function sanitizeAnswers(answers: AttemptAnswer[], questionById: Map<string, ExamQuestion>) {
  const seen = new Set<string>();
  const sanitized: AttemptAnswer[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string" || seen.has(answer.questionId)) return null;
    const question = questionById.get(answer.questionId);
    if (!question || !Array.isArray(answer.selectedOptionIds) || answer.selectedOptionIds.length > question.options.length) return null;
    const validOptionIds = new Set(question.options.map((option) => option.id));
    if (answer.selectedOptionIds.some((id) => typeof id !== "string" || !validOptionIds.has(id))) return null;
    if (!Number.isFinite(answer.timeSpentSeconds) || answer.timeSpentSeconds < 0) return null;
    seen.add(answer.questionId);
    sanitized.push({
      questionId: answer.questionId,
      selectedOptionIds: [...new Set(answer.selectedOptionIds)],
      timeSpentSeconds: Math.min(24 * 60 * 60, Math.round(answer.timeSpentSeconds)),
      markedForReview: Boolean(answer.markedForReview),
    });
  }
  return sanitized;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(new Date(value).getTime());
}
