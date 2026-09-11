import { describe, expect, it } from "vitest";
import { dedupeImportQuestions, hcipHuaweiPreset, isAnswerCorrect, parseDelimitedAnswers, scoreAttempt, shuffleWithSeed } from "@/lib/exam-engine";
import { sampleQuestions } from "@/lib/questions";

describe("exam scoring", () => {
  it("uses a 100-question exam preset", () => {
    expect(hcipHuaweiPreset.questionCount).toBe(100);
  });

  it("randomizes without duplicating questions", () => {
    const questions = Array.from({ length: 120 }, (_, index) => index);
    const randomized = shuffleWithSeed(questions, "fresh-session").slice(0, hcipHuaweiPreset.questionCount);
    expect(new Set(randomized).size).toBe(100);
    expect(randomized).not.toEqual(questions.slice(0, 100));
  });

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

  it("removes repeated imported questions and questions already in the bank", () => {
    const question = {
      topic: "Power",
      subtopic: "UPS",
      type: "single" as const,
      question: "Which UPS mode is active?",
      options: ["Normal", "Bypass"],
      answer: "A",
      explanation: "",
      sourceReference: "fixture",
    };
    expect(dedupeImportQuestions([
      question,
      { ...question, question: "Which UPS mode is active!" },
      { ...question, question: "Which cooling mode is active?" },
    ], ["Which UPS mode is active?"])).toEqual([{ ...question, question: "Which cooling mode is active?" }]);
  });
});
