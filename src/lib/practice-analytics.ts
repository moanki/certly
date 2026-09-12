import type { ExamReadiness, MockPerformance, PracticeProgress, ReadinessState } from "@/types/practice";

const weights = {
  knowledgeMastery: 0.3,
  topicCoverage: 0.2,
  recentAccuracy: 0.2,
  weakAreaPerformance: 0.15,
  mockExamPerformance: 0.15,
};

export function calculateExamReadiness(
  progress: PracticeProgress[],
  mockPerformance: MockPerformance[],
  totalQuestions: number,
): ExamReadiness {
  const attempted = progress.length;
  const mastered = progress.filter((item) => item.previousCorrect).length;
  const recent = [...progress]
    .sort((left, right) => Date.parse(right.lastAttemptedAt) - Date.parse(left.lastAttemptedAt))
    .slice(0, 20);
  const topicPerformance = summarizeAreas(progress);
  const weakestAreas = [...topicPerformance]
    .sort((left, right) => left.percent - right.percent || right.attempts - left.attempts || left.name.localeCompare(right.name));
  const weakAreas = weakestAreas.slice(0, 3);

  const metrics = {
    knowledgeMastery: percent(mastered, totalQuestions),
    topicCoverage: percent(attempted, totalQuestions),
    recentAccuracy: percent(recent.filter((item) => item.previousCorrect).length, recent.length),
    weakAreaPerformance: weakAreas.length
      ? Math.round(weakAreas.reduce((total, area) => total + area.percent, 0) / weakAreas.length)
      : 0,
    mockExamPerformance: mockPerformance.length
      ? Math.round(mockPerformance.slice(0, 3).reduce((total, attempt) => total + attempt.percent, 0) / Math.min(3, mockPerformance.length))
      : 0,
  };

  const score = clamp(Math.round(
    metrics.knowledgeMastery * weights.knowledgeMastery
      + metrics.topicCoverage * weights.topicCoverage
      + metrics.recentAccuracy * weights.recentAccuracy
      + metrics.weakAreaPerformance * weights.weakAreaPerformance
      + metrics.mockExamPerformance * weights.mockExamPerformance,
  ));

  return {
    score,
    state: readinessState(score),
    metrics,
    recommendedNext: weakAreas.map((area) => area.name),
  };
}

export function readinessState(score: number): ReadinessState {
  if (score >= 90) return "Strongly Prepared";
  if (score >= 75) return "Exam Ready";
  if (score >= 60) return "Almost Ready";
  if (score >= 40) return "Building Knowledge";
  return "Getting Started";
}

function summarizeAreas(progress: PracticeProgress[]) {
  const areas = new Map<string, { attempts: number; correct: number }>();
  for (const item of progress) {
    const name = usefulSubtopic(item.subtopic, item.topic) ? item.subtopic : item.topic;
    const current = areas.get(name) ?? { attempts: 0, correct: 0 };
    current.attempts += item.totalAttempts;
    current.correct += item.correctAttempts;
    areas.set(name, current);
  }
  return [...areas.entries()].map(([name, value]) => ({
    name,
    attempts: value.attempts,
    percent: percent(value.correct, value.attempts),
  }));
}

function usefulSubtopic(subtopic: string, topic: string) {
  const normalized = subtopic.trim().toLowerCase();
  return normalized.length > 0
    && normalized !== topic.trim().toLowerCase()
    && !["general", "unassigned", "hcip-dcf comprehensive"].includes(normalized);
}

function percent(value: number, total: number) {
  return total > 0 ? clamp(Math.round((value / total) * 100)) : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
