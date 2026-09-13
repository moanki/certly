import { describe, expect, it } from "vitest";
import { calculateExamReadiness, calculateTopicPerformance, readinessState } from "@/lib/practice-analytics";
import type { ExamQuestion } from "@/types/exam";
import type { PracticeProgress } from "@/types/practice";

describe("practice analytics", () => {
  it("maps the requested readiness thresholds", () => {
    expect(readinessState(0)).toBe("Getting Started");
    expect(readinessState(40)).toBe("Building Knowledge");
    expect(readinessState(60)).toBe("Almost Ready");
    expect(readinessState(75)).toBe("Exam Ready");
    expect(readinessState(90)).toBe("Strongly Prepared");
  });

  it("calculates weighted readiness from recorded activity", () => {
    const progress: PracticeProgress[] = [
      progressItem("q1", "UPS5000", "Redundancy", 3, 2, true, "2026-09-11T10:00:00.000Z"),
      progressItem("q2", "Cooling", "Architecture", 2, 0, false, "2026-09-10T10:00:00.000Z"),
      progressItem("q3", "SmartLi", "Components", 1, 1, true, "2026-09-09T10:00:00.000Z"),
    ];
    const result = calculateExamReadiness(progress, [{ percent: 80, attemptedAt: "2026-09-11T12:00:00.000Z" }], 6);

    expect(result.metrics).toEqual({
      knowledgeMastery: 33,
      topicCoverage: 50,
      recentAccuracy: 67,
      weakAreaPerformance: 56,
      mockExamPerformance: 80,
    });
    expect(result.score).toBe(54);
    expect(result.state).toBe("Building Knowledge");
    expect(result.recommendedNext).toEqual(["Architecture", "Redundancy", "Components"]);
  });

  it("returns real zero values when no activity exists", () => {
    const result = calculateExamReadiness([], [], 462);
    expect(result.score).toBe(0);
    expect(result.state).toBe("Getting Started");
    expect(result.recommendedNext).toEqual([]);
  });

  it("does not let reinforcement answers raise current-session mastery", () => {
    const item = progressItem("q1", "UPS5000", "Redundancy", 4, 3, true, "2026-09-11T10:00:00.000Z", [true, true, true, false]);
    item.firstAttemptCorrect = false;
    item.firstAttemptedAt = "2026-09-10T10:00:00.000Z";
    const result = calculateExamReadiness([item], [], 1);

    expect(result.metrics.knowledgeMastery).toBe(0);
    expect(result.metrics.recentAccuracy).toBe(0);
  });

  it("requires five unique attempted questions before assigning topic mastery", () => {
    const questions = questionInventory("UPS5000", 40);
    const progress = [
      progressItem("UPS5000-1", "UPS5000", "UPS 5000", 1, 1, true, "2026-09-11T10:00:00.000Z"),
      progressItem("UPS5000-2", "UPS5000", "UPS 5000", 1, 1, true, "2026-09-11T09:00:00.000Z"),
    ];
    const result = calculateTopicPerformance(progress, questions);

    expect(result.overallMastery).toBeNull();
    expect(result.topics[0]).toMatchObject({ mastery: null, status: "Insufficient Data", questionsAttempted: 2, totalQuestions: 40 });
    expect(result.strongest).toEqual([]);
    expect(result.needsAttention).toEqual([]);
  });

  it("weights accuracy, coverage, and the latest ten attempts", () => {
    const questions = questionInventory("Cooling", 10);
    const progress = Array.from({ length: 5 }, (_, index) => progressItem(
      `Cooling-${index + 1}`,
      "Cooling",
      "Smart Cooling Solution",
      2,
      index < 4 ? 2 : 0,
      index < 3,
      `2026-09-11T0${index}:00:00.000Z`,
      index < 3 ? [true, true] : [false, false],
    ));
    const result = calculateTopicPerformance(progress, questions);

    expect(result.topics[0]).toMatchObject({
      accuracy: 80,
      coverage: 50,
      recentPerformance: 60,
      mastery: 67,
      status: "Proficient",
      questionsAttempted: 5,
      totalQuestions: 10,
    });
    expect(result.overallMastery).toBe(67);
  });

  it("orders strongest and needs-attention topics from actual mastery", () => {
    const questions = [...questionInventory("UPS5000", 5), ...questionInventory("Cooling", 5), ...questionInventory("SmartLi", 5)];
    const progress = [
      ...topicProgress("UPS5000", 5, 1),
      ...topicProgress("Cooling", 5, 2),
      ...topicProgress("SmartLi", 5, 5),
    ];
    const result = calculateTopicPerformance(progress, questions);

    expect(result.strongest.map((topic) => topic.topic)).toEqual(["SmartLi"]);
    expect(result.needsAttention.map((topic) => topic.topic)).toEqual(["UPS5000", "Cooling"]);
  });
});

function progressItem(
  questionId: string,
  topic: string,
  subtopic: string,
  totalAttempts: number,
  correctAttempts: number,
  previousCorrect: boolean,
  lastAttemptedAt: string,
  recentResults = [previousCorrect],
): PracticeProgress {
  return {
    questionId,
    topic,
    subtopic,
    totalAttempts,
    correctAttempts,
    previousCorrect,
    lastAttemptedAt,
    recentAttempts: recentResults.map((correct, index) => ({ correct, attemptedAt: new Date(Date.parse(lastAttemptedAt) - index * 1000).toISOString() })),
  };
}

function questionInventory(topic: string, count: number): ExamQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${topic}-${index + 1}`,
    certificationId: "hcip-dcf",
    examVersion: "test",
    topic,
    subtopic: topic,
    difficulty: "intermediate",
    type: "single",
    text: `Question ${index + 1}`,
    options: [],
    explanation: "",
    sourceType: "mock_exam",
    sourceReference: "test",
  }));
}

function topicProgress(topic: string, count: number, correct: number) {
  return Array.from({ length: count }, (_, index) => progressItem(
    `${topic}-${index + 1}`,
    topic,
    topic,
    1,
    index < correct ? 1 : 0,
    index < correct,
    `2026-09-11T0${index}:00:00.000Z`,
  ));
}
