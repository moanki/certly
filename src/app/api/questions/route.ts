import { loadActiveQuestions, redactQuestion } from "@/lib/question-store";
import { enforceRateLimit, noStoreJson } from "@/lib/security";

export async function GET(request: Request) {
  const rateLimitError = enforceRateLimit(request, "questions", 120, 60 * 1_000);
  if (rateLimitError) return rateLimitError;
  const questions = await loadActiveQuestions();
  return noStoreJson({ questions: questions.map(redactQuestion) });
}
