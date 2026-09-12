import { describe, expect, it } from "vitest";
import { calculateExamReadiness, readinessState } from "@/lib/practice-analytics";
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
});

function progressItem(
  questionId: string,
  topic: string,
  subtopic: string,
  totalAttempts: number,
  correctAttempts: number,
  previousCorrect: boolean,
  lastAttemptedAt: string,
): PracticeProgress {
  return { questionId, topic, subtopic, totalAttempts, correctAttempts, previousCorrect, lastAttemptedAt };
}
