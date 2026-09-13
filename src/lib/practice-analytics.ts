import type { ExamQuestion } from "@/types/exam";
import type { ExamReadiness, MockPerformance, PracticeProgress, ReadinessState, TopicPerformanceDetail, TopicPerformanceStatus, TopicPerformanceSummary } from "@/types/practice";

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
  topicRecommendations?: string[],
): ExamReadiness {
  const attempted = progress.length;
  const mastered = progress.filter((item) => item.firstAttemptCorrect ?? item.previousCorrect).length;
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
    recentAccuracy: percent(recent.filter((item) => item.firstAttemptCorrect ?? item.previousCorrect).length, recent.length),
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
    recommendedNext: topicRecommendations ?? weakAreas.map((area) => area.name),
  };
}

export function calculateTopicPerformance(progress: PracticeProgress[], questions: ExamQuestion[]): TopicPerformanceSummary {
  const questionInventory = groupBy(questions, (question) => question.topic);
  const progressByTopic = groupBy(progress, (item) => item.topic);
  const topics = [...questionInventory.entries()].map(([topic, topicQuestions]) => {
    const topicProgress = progressByTopic.get(topic) ?? [];
    return calculateTopicDetail(topic, topicProgress, topicQuestions);
  });
  const sufficient = topics.filter((topic) => topic.mastery !== null);
  const strongest = [...sufficient]
    .filter((topic) => topic.status === "Strong" || topic.status === "Proficient")
    .sort((left, right) => (right.mastery ?? 0) - (left.mastery ?? 0) || left.topic.localeCompare(right.topic))
    .slice(0, 3);
  const needsAttention = [...sufficient]
    .filter((topic) => topic.status === "Needs Attention" || topic.status === "Developing")
    .sort((left, right) => (left.mastery ?? 0) - (right.mastery ?? 0) || left.topic.localeCompare(right.topic))
    .slice(0, 5);
  const insufficientData = topics
    .filter((topic) => topic.status === "Insufficient Data")
    .sort((left, right) => right.questionsAttempted - left.questionsAttempted || left.topic.localeCompare(right.topic));
  const weightedTotal = sufficient.reduce((total, topic) => total + (topic.mastery ?? 0) * topic.totalQuestions, 0);
  const representedQuestions = sufficient.reduce((total, topic) => total + topic.totalQuestions, 0);

  return {
    overallMastery: representedQuestions ? clamp(Math.round(weightedTotal / representedQuestions)) : null,
    strongest,
    needsAttention,
    insufficientData,
    topics,
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
    const scored = scoredAttempts(item);
    current.attempts += scored.attempts;
    current.correct += scored.correct;
    areas.set(name, current);
  }
  return [...areas.entries()].map(([name, value]) => ({
    name,
    attempts: value.attempts,
    percent: percent(value.correct, value.attempts),
  }));
}

function calculateTopicDetail(topic: string, progress: PracticeProgress[], questions: ExamQuestion[]): TopicPerformanceDetail {
  const questionsAttempted = progress.length;
  const totalAttempts = progress.reduce((total, item) => total + scoredAttempts(item).attempts, 0);
  const correctAttempts = progress.reduce((total, item) => total + scoredAttempts(item).correct, 0);
  const recentAttempts = progress
    .flatMap((item) => item.firstAttemptCorrect === undefined
      ? item.recentAttempts
      : [{ attemptedAt: item.firstAttemptedAt ?? item.lastAttemptedAt, correct: item.firstAttemptCorrect }])
    .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt))
    .slice(0, 10);
  const accuracy = percent(correctAttempts, totalAttempts);
  const coverage = percent(questionsAttempted, questions.length);
  const recentPerformance = percent(recentAttempts.filter((attempt) => attempt.correct).length, recentAttempts.length);
  const rawMastery = clamp(Math.round(accuracy * 0.5 + coverage * 0.3 + recentPerformance * 0.2));
  const enoughData = questionsAttempted >= 5;

  return {
    topic,
    mastery: enoughData ? rawMastery : null,
    status: enoughData ? topicStatus(rawMastery) : "Insufficient Data",
    accuracy,
    coverage,
    recentPerformance,
    questionsAttempted,
    totalQuestions: questions.length,
    totalAttempts,
    weakestSubtopics: calculateWeakestSubtopics(progress, questions),
  };
}

function calculateWeakestSubtopics(progress: PracticeProgress[], questions: ExamQuestion[]) {
  const inventory = groupBy(questions.filter((question) => usefulSubtopic(question.subtopic, question.topic)), (question) => question.subtopic);
  if (inventory.size < 2) return [];
  const progressBySubtopic = groupBy(progress, (item) => item.subtopic);
  return [...inventory.entries()]
    .flatMap(([name, subtopicQuestions]) => {
      const subtopicProgress = progressBySubtopic.get(name) ?? [];
      if (subtopicProgress.length < 2) return [];
      const attempts = subtopicProgress.reduce((total, item) => total + scoredAttempts(item).attempts, 0);
      const correct = subtopicProgress.reduce((total, item) => total + scoredAttempts(item).correct, 0);
      const recent = subtopicProgress.flatMap((item) => item.firstAttemptCorrect === undefined
        ? item.recentAttempts
        : [{ attemptedAt: item.firstAttemptedAt ?? item.lastAttemptedAt, correct: item.firstAttemptCorrect }])
        .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt))
        .slice(0, 10);
      const mastery = Math.round(
        percent(correct, attempts) * 0.5
          + percent(subtopicProgress.length, subtopicQuestions.length) * 0.3
          + percent(recent.filter((attempt) => attempt.correct).length, recent.length) * 0.2,
      );
      return [{ name, mastery: clamp(mastery) }];
    })
    .sort((left, right) => left.mastery - right.mastery || left.name.localeCompare(right.name))
    .slice(0, 3);
}

function topicStatus(mastery: number): TopicPerformanceStatus {
  if (mastery >= 80) return "Strong";
  if (mastery >= 65) return "Proficient";
  if (mastery >= 50) return "Developing";
  return "Needs Attention";
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function usefulSubtopic(subtopic: string, topic: string) {
  const normalized = subtopic.trim().toLowerCase();
  return normalized.length > 0
    && normalized !== topic.trim().toLowerCase()
    && !["general", "unassigned", "hcip-dcf comprehensive"].includes(normalized);
}

function scoredAttempts(item: PracticeProgress) {
  return item.firstAttemptCorrect === undefined
    ? { attempts: item.totalAttempts, correct: item.correctAttempts }
    : { attempts: 1, correct: item.firstAttemptCorrect ? 1 : 0 };
}

function percent(value: number, total: number) {
  return total > 0 ? clamp(Math.round((value / total) * 100)) : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
