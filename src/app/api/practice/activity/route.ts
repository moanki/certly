import { getOrCreateParticipantId } from "@/lib/participant";
import { loadPracticeActivity } from "@/lib/practice-activity-store";
import { loadActiveQuestions } from "@/lib/question-store";
import { enforceRateLimit, noStoreJson } from "@/lib/security";

export async function GET(request: Request) {
  const rateLimitError = enforceRateLimit(request, "practice-activity", 120, 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  try {
    const practiceSessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
    if (practiceSessionId && !/^[a-f0-9]{32}$/.test(practiceSessionId)) {
      return noStoreJson({ error: "Practice session is invalid." }, { status: 400 });
    }
    const participantId = await getOrCreateParticipantId();
    const questions = await loadActiveQuestions();
    const activity = await loadPracticeActivity(participantId, questions, practiceSessionId);
    return noStoreJson({ activity });
  } catch {
    return noStoreJson({ error: "Practice activity could not be loaded." }, { status: 500 });
  }
}
