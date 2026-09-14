import { getOrCreateParticipantId } from "@/lib/participant";
import { createEmptyPracticeActivity, loadPracticeActivity } from "@/lib/practice-activity-store";
import { loadActiveQuestions } from "@/lib/question-store";
import { enforceRateLimit, noStoreJson } from "@/lib/security";

export async function GET(request: Request) {
  const rateLimitError = enforceRateLimit(request, "practice-activity", 120, 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  const practiceSessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  if (practiceSessionId && !/^[a-f0-9]{32}$/.test(practiceSessionId)) {
    return noStoreJson({ error: "Practice session is invalid." }, { status: 400 });
  }
  const questions = await loadActiveQuestions();
  try {
    const participantId = await getOrCreateParticipantId();
    const activity = await loadPracticeActivity(participantId, questions, practiceSessionId);
    return noStoreJson({ activity });
  } catch {
    return noStoreJson({
      activity: createEmptyPracticeActivity(questions, practiceSessionId),
      degraded: true,
      warning: "Practice history is temporarily unavailable. You can continue practicing.",
    });
  }
}
