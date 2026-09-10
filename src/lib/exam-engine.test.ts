import { describe, expect, it } from "vitest";
import { isAnswerCorrect, parseDelimitedAnswers, scoreAttempt } from "@/lib/exam-engine";
import { sampleQuestions } from "@/lib/questions";

describe("exam scoring", () => {
  it("requires every correct option and no incorrect options", () => {
    const question = sampleQuestions.find((item) => item.type === "multiple")!;
    const correct = question.options.filter((option) => option.isCorrect).map((option) => option.id);
    expect(isAnswerCorrect(question, correct)).toBe(true);
    expect(isAnswerCorrect(question, correct.slice(0, -1))).toBe(false);
    expect(isAnswerCorrect(question, [...correct, question.options.find((option) => !option.isCorrect)!.id])).toBe(false);
  });

  it("uses the 1000 point scale and 600 pass mark", () => {
    const questions = sampleQuestions.slice(0, 5);
    const answers = questions.slice(0, 3).map((question) => ({
      questionId: question.id,
      selectedOptionIds: question.options.filter((option) => option.isCorrect).map((option) => option.id),
      timeSpentSeconds: 30,
      markedForReview: false,
    }));
    const result = scoreAttempt(questions, answers);
    expect(result.score).toBe(600);
    expect(result.passed).toBe(true);
    expect(result.unanswered).toBe(2);
  });

  it("normalizes common imported answer formats", () => {
    expect(parseDelimitedAnswers("AC")).toEqual(["A", "C"]);
    expect(parseDelimitedAnswers("A and C")).toEqual(["A", "C"]);
    expect(parseDelimitedAnswers("(A, C)")).toEqual(["A", "C"]);
    expect(parseDelimitedAnswers("not an answer")).toEqual([]);
  });
});
