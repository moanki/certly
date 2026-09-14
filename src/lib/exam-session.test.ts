import { describe, expect, it } from "vitest";
import { parseExamDraft, parseTemporaryExamResult } from "@/lib/exam-session";

describe("exam browser session", () => {
  const draft = {
    candidate: { name: "Learner", email: "" },
    timed: true,
    startedAt: "2026-09-14T10:00:00.000Z",
    questionIds: ["q1", "q2"],
    questionIndex: 1,
    answers: [{ questionId: "q1", selectedOptionIds: ["a"], timeSpentSeconds: 12, markedForReview: false }],
    marked: ["q2"],
    deadlineAt: 1_789_380_000_000,
    remainingSeconds: 5_000,
    pausedAt: "2026-09-14T10:05:00.000Z",
    pausedDurationSeconds: 30,
    questionOpenedAt: 1_789_379_900_000,
  };

  it("restores the exact question order, location, pause, answers, and marks", () => {
    expect(parseExamDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("rejects malformed or duplicate-question drafts", () => {
    expect(parseExamDraft("not-json")).toBeNull();
    expect(parseExamDraft(JSON.stringify({ ...draft, questionIds: ["q1", "q1"] }))).toBeNull();
  });

  it("restores a temporary result only when its review data is complete", () => {
    const summary = { score: 800, total: 1, results: [{}], byTopic: [], percent: 80, passed: true, correct: 1, incorrect: 0, unanswered: 0 };
    expect(parseTemporaryExamResult(JSON.stringify({ summary, saveStatus: "Attempt saved." })))?.toMatchObject({ summary: { score: 800, total: 1 } });
    expect(parseTemporaryExamResult(JSON.stringify({ summary: { ...summary, results: [] } }))).toBeNull();
  });
});
