import { describe, expect, it } from "vitest";
import { createEmptyPracticeActivity, mergePracticeProgress } from "@/lib/practice-activity-store";
import staticQuestionBank from "@/lib/static-question-bank.json";
import type { ExamQuestion } from "@/types/exam";
import type { PracticeProgress } from "@/types/practice";

describe("practice activity fallback", () => {
  it("creates a fresh session without inventing learner history", () => {
    const questions = staticQuestionBank as unknown as ExamQuestion[];
    const activity = createEmptyPracticeActivity(questions, "0123456789abcdef0123456789abcdef");

    expect(activity.session.id).toBe("0123456789abcdef0123456789abcdef");
    expect(activity.session.uniqueQuestions).toBe(0);
    expect(activity.session.blockTarget).toBe(100);
    expect(activity.sessionProgress).toEqual([]);
    expect(activity.historyByQuestion).toEqual({});
  });

  it("merges append-only attempts without changing the first-attempt result", () => {
    const base = {
      questionId: "q1",
      topic: "UPS",
      subtopic: "Modes",
      totalAttempts: 1,
      correctAttempts: 0,
      lastAttemptedAt: "2026-09-14T10:00:00.000Z",
      previousCorrect: false,
      recentAttempts: [{ attemptedAt: "2026-09-14T10:00:00.000Z", correct: false, kind: "initial" as const }],
      attemptKind: "initial" as const,
      firstAttemptCorrect: false,
      firstAttemptedAt: "2026-09-14T10:00:00.000Z",
      reinforcementAttempts: 0,
      reinforcementCorrect: 0,
      reviewAttempts: 0,
    } satisfies PracticeProgress;
    const reinforcement: PracticeProgress = {
      ...base,
      correctAttempts: 1,
      lastAttemptedAt: "2026-09-14T10:10:00.000Z",
      previousCorrect: true,
      recentAttempts: [{ attemptedAt: "2026-09-14T10:10:00.000Z", correct: true, kind: "reinforcement" }],
      attemptKind: "reinforcement",
      firstAttemptCorrect: undefined,
      firstAttemptedAt: undefined,
      reinforcementAttempts: 1,
      reinforcementCorrect: 1,
    };

    expect(mergePracticeProgress([reinforcement, base])[0]).toMatchObject({
      totalAttempts: 2,
      correctAttempts: 1,
      firstAttemptCorrect: false,
      previousCorrect: true,
      reinforcementAttempts: 1,
      reinforcementCorrect: 1,
    });
  });
});
