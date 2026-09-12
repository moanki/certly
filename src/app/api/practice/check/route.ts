import { loadActiveQuestions } from "@/lib/question-store";
import { isAnswerCorrect } from "@/lib/exam-engine";
import { getOrCreateParticipantId } from "@/lib/participant";
import { loadPracticeActivity, recordPracticeAttempt } from "@/lib/practice-activity-store";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson } from "@/lib/security";
import type { Candidate } from "@/types/exam";

export async function POST(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, 8 * 1024);
  if (sizeError) return sizeError;
  const rateLimitError = enforceRateLimit(request, "practice-check", 120, 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  let body: { questionId?: unknown; selectedOptionIds?: unknown; candidate?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
  }

  if (typeof body.questionId !== "string" || body.questionId.length > 64 || !Array.isArray(body.selectedOptionIds)) {
    return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
  }
  if (body.selectedOptionIds.length > 10 || body.selectedOptionIds.some((id) => typeof id !== "string" || id.length > 36)) {
    return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
  }
  const candidate = sanitizeCandidate(body.candidate);
  if (body.candidate !== undefined && !candidate) {
    return noStoreJson({ error: "Candidate data is invalid." }, { status: 400 });
  }

  try {
    const questions = await loadActiveQuestions();
    const question = questions.find((item) => item.id === body.questionId);
    if (!question) return noStoreJson({ error: "Question not found." }, { status: 404 });
    const validOptionIds = new Set(question.options.map((option) => option.id));
    if (body.selectedOptionIds.some((id) => !validOptionIds.has(id))) {
      return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
    }

    const selectedOptionIds = body.selectedOptionIds as string[];
    const participantId = await getOrCreateParticipantId();
    await recordPracticeAttempt(participantId, question, isAnswerCorrect(question, selectedOptionIds), new Date().toISOString(), candidate);
    const activity = await loadPracticeActivity(participantId, questions);

    return noStoreJson({ question, activity });
  } catch {
    return noStoreJson({ error: "Answer could not be checked or saved." }, { status: 500 });
  }
}

function sanitizeCandidate(value: unknown): Candidate | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Candidate>;
  if (typeof candidate.name !== "string" || typeof candidate.email !== "string") return undefined;
  const name = candidate.name.trim();
  const email = candidate.email.trim().toLowerCase();
  if (!name) return undefined;
  if (name.length > 128 || email.length > 254) return undefined;
  return { name, email };
}
