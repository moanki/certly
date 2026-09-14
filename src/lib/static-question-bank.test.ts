import { describe, expect, it } from "vitest";
import staticQuestionBank from "@/lib/static-question-bank.json";
import { uniqueExamQuestions } from "@/lib/exam-engine";
import type { ExamQuestion } from "@/types/exam";

const questions = staticQuestionBank as unknown as ExamQuestion[];

describe("static question-bank fallback", () => {
  it("contains enough unique questions for a full exam", () => {
    expect(questions.length).toBeGreaterThanOrEqual(100);
    expect(uniqueExamQuestions(questions)).toHaveLength(questions.length);
  });

  it("keeps a valid marked answer and explanation for every question", () => {
    for (const question of questions) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.options.some((option) => option.isCorrect)).toBe(true);
      expect(question.explanation.trim().length).toBeGreaterThan(20);
    }
  });
});
