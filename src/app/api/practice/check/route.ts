import { loadActiveQuestions } from "@/lib/question-store";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson } from "@/lib/security";

export async function POST(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, 8 * 1024);
  if (sizeError) return sizeError;
  const rateLimitError = enforceRateLimit(request, "practice-check", 120, 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  try {
    const body = (await request.json()) as { questionId?: unknown; selectedOptionIds?: unknown };
    if (typeof body.questionId !== "string" || body.questionId.length > 64 || !Array.isArray(body.selectedOptionIds)) {
      return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
    }
    if (body.selectedOptionIds.length > 10 || body.selectedOptionIds.some((id) => typeof id !== "string" || id.length > 36)) {
      return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
    }

    const question = (await loadActiveQuestions()).find((item) => item.id === body.questionId);
    if (!question) return noStoreJson({ error: "Question not found." }, { status: 404 });
    const validOptionIds = new Set(question.options.map((option) => option.id));
    if (body.selectedOptionIds.some((id) => !validOptionIds.has(id))) {
      return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
    }

    return noStoreJson({ question });
  } catch {
    return noStoreJson({ error: "Answer data is invalid." }, { status: 400 });
  }
}
