import { describe, expect, it } from "vitest";
import { createEmptyPracticeActivity } from "@/lib/practice-activity-store";
import staticQuestionBank from "@/lib/static-question-bank.json";
import type { ExamQuestion } from "@/types/exam";

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
});
