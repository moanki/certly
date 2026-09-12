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
