import { describe, expect, it } from "vitest";
import { buildAdminPerformance, fingerprintQuestion, type PerformanceRecordRow } from "@/lib/admin-performance";

describe("admin performance analytics", () => {
  it("keeps practice and exam scoreboards separate", () => {
    const practiceRows = [
      row("practice-1", "participant-1", "2026-09-10T10:00:00.000Z", {
        questionId: "q1",
        totalAttempts: 3,
        correctAttempts: 2,
        lastAttemptedAt: "2026-09-10T10:00:00.000Z",
        previousCorrect: true,
        recentAttempts: [
          { attemptedAt: "2026-09-08T10:00:00.000Z", correct: true },
          { attemptedAt: "2026-09-09T10:00:00.000Z", correct: false },
          { attemptedAt: "2026-09-10T10:00:00.000Z", correct: true },
        ],
        candidateName: "Learner One",
      }),
      row("practice-2", "participant-1", "2026-09-11T10:00:00.000Z", {
        questionId: "q2",
        totalAttempts: 1,
        correctAttempts: 1,
        lastAttemptedAt: "2026-09-11T10:00:00.000Z",
        previousCorrect: true,
        recentAttempts: [{ attemptedAt: "2026-09-11T10:00:00.000Z", correct: true }],
        candidateName: "Learner One",
      }),
    ];
    const examRows = [
      examRow("exam-1", "2026-09-09T10:00:00.000Z", 600, ["q1", "q2"]),
      examRow("exam-2", "2026-09-12T10:00:00.000Z", 800, ["q2", "q3"]),
    ];

    const result = buildAdminPerformance(examRows, practiceRows);

    expect(result.practice.leaders[0]).toMatchObject({
      name: "Learner One",
      questionsAttempted: 4,
      uniqueQuestionsAttempted: 2,
      totalScore: 75,
    });
    expect(result.practice.series[0].points.map((point) => point.score)).toEqual([100, 50, 67, 75]);
    expect(result.exam.leaders[0]).toMatchObject({
      name: "Learner One",
      questionsAttempted: 4,
      uniqueQuestionsAttempted: 3,
      totalScore: 800,
      completedAttempts: 2,
    });
    expect(result.exam.series[0].points.map((point) => point.score)).toEqual([600, 800]);
  });

  it("ranks users by score and uses safe anonymous labels", () => {
    const rows = [
      examRow("exam-1", "2026-09-09T10:00:00.000Z", 500, ["q1"], "First", "first@example.com"),
      examRow("exam-2", "2026-09-10T10:00:00.000Z", 900, ["q2"], "Second", "second@example.com"),
    ];
    const practice = row("practice", "participant-without-name", "2026-09-10T10:00:00.000Z", {
      questionId: "q1",
      totalAttempts: 1,
      correctAttempts: 1,
      lastAttemptedAt: "2026-09-10T10:00:00.000Z",
      previousCorrect: true,
    });

    const result = buildAdminPerformance(rows, [practice]);

    expect(result.exam.leaders.map((leader) => leader.name)).toEqual(["Second", "First"]);
    expect(result.practice.leaders[0].name).toMatch(/^Anonymous learner /);
  });

  it("derives unique exam questions from legacy answer records", () => {
    const legacy = row("legacy", "legacy@example.com", "2026-09-08T10:00:00.000Z", {
      candidateName: "Legacy Learner",
      candidateEmail: "legacy@example.com",
      submittedAt: "2026-09-08T10:00:00.000Z",
      score: 700,
      total: 100,
      answers: [{ questionId: "q1" }, { questionId: "q2" }, { questionId: "q1" }],
    });

    const result = buildAdminPerformance([legacy], []);

    expect(result.exam.leaders[0]).toMatchObject({ questionsAttempted: 100, uniqueQuestionsAttempted: 2, totalScore: 700 });
  });

  it("links historical practice names through matching exam activity", () => {
    const exam = examRow("exam", "2026-09-08T10:00:00.000Z", 700, ["q1"], "Known Learner");
    const practice = row("practice", "participant-1", "2026-09-09T10:00:00.000Z", {
      questionId: "q1",
      totalAttempts: 1,
      correctAttempts: 1,
      lastAttemptedAt: "2026-09-09T10:00:00.000Z",
      previousCorrect: true,
    });
    const activity = row("activity", "participant-1", "2026-09-08T10:00:00.000Z", {
      percent: 70,
      attemptedAt: "2026-09-08T10:00:00.000Z",
    });

    const result = buildAdminPerformance([exam], [practice], [activity]);

    expect(result.practice.leaders[0].name).toBe("Known Learner");
  });

  it("keeps practice sessions separate and scores only first attempts", () => {
    const learnerId = "a".repeat(32);
    const firstSession = "1".repeat(32);
    const secondSession = "2".repeat(32);
    const practice = [
      sessionRow("first-q1", learnerId, firstSession, "q1", "2026-09-10T10:00:00.000Z", false, 4, 3),
      sessionRow("first-q2", learnerId, firstSession, "q2", "2026-09-10T11:00:00.000Z", true, 1, 1),
      sessionRow("second-q1", learnerId, secondSession, "q1", "2026-09-12T10:00:00.000Z", true, 2, 2),
    ];

    const result = buildAdminPerformance([], practice);

    expect(result.practice.leaders).toHaveLength(2);
    expect(result.practice.leaders).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Same Learner", startedAt: "2026-09-10T10:00:00.000Z", questionsAttempted: 5, uniqueQuestionsAttempted: 2, totalScore: 50 }),
      expect.objectContaining({ name: "Same Learner", startedAt: "2026-09-12T10:00:00.000Z", questionsAttempted: 2, uniqueQuestionsAttempted: 1, totalScore: 100 }),
    ]));
    expect(result.practice.series.find((series) => series.points.length === 2)?.points.map((point) => point.score)).toEqual([0, 50]);
  });

  it("does not merge different learners who share a display name", () => {
    const sessionId = "3".repeat(32);
    const practice = [
      sessionRow("learner-a", "a".repeat(32), sessionId, "q1", "2026-09-10T10:00:00.000Z", true, 1, 1),
      sessionRow("learner-b", "b".repeat(32), sessionId, "q1", "2026-09-10T10:01:00.000Z", false, 1, 0),
    ];

    expect(buildAdminPerformance([], practice).practice.leaders).toHaveLength(2);
  });
});

function row(id: string, lookup: string, occurredAt: string, payload: object): PerformanceRecordRow {
  return { $id: id, lookup, occurredAt, payloadJson: JSON.stringify(payload) };
}

function examRow(
  id: string,
  submittedAt: string,
  score: number,
  questionIds: string[],
  candidateName = "Learner One",
  candidateEmail = "learner@example.com",
) {
  return row(id, candidateEmail, submittedAt, {
    candidateName,
    candidateEmail,
    submittedAt,
    score,
    total: questionIds.length,
    questionKeys: questionIds.map(fingerprintQuestion),
  });
}

function sessionRow(id: string, learnerId: string, practiceSessionId: string, questionId: string, attemptedAt: string, firstAttemptCorrect: boolean, totalAttempts: number, correctAttempts: number) {
  return row(id, `${learnerId}:${practiceSessionId}`, attemptedAt, {
    questionId,
    totalAttempts,
    correctAttempts,
    lastAttemptedAt: attemptedAt,
    previousCorrect: correctAttempts === totalAttempts,
    recentAttempts: [{ attemptedAt, correct: firstAttemptCorrect, kind: "initial" }],
    candidateName: "Same Learner",
    learnerId,
    practiceSessionId,
    firstAttemptCorrect,
    firstAttemptedAt: attemptedAt,
  });
}
