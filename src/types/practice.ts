export type QuestionHistory = {
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptedAt: string;
  previousCorrect: boolean;
};

export type PracticeProgress = QuestionHistory & {
  questionId: string;
  topic: string;
  subtopic: string;
};

export type MockPerformance = {
  percent: number;
  attemptedAt: string;
};

export type ReadinessState =
  | "Getting Started"
  | "Building Knowledge"
  | "Almost Ready"
  | "Exam Ready"
  | "Strongly Prepared";

export type ReadinessMetrics = {
  knowledgeMastery: number;
  topicCoverage: number;
  recentAccuracy: number;
  weakAreaPerformance: number;
  mockExamPerformance: number;
};

export type ExamReadiness = {
  score: number;
  state: ReadinessState;
  metrics: ReadinessMetrics;
  recommendedNext: string[];
};

export type PracticeActivity = {
  historyByQuestion: Record<string, QuestionHistory>;
  readiness: ExamReadiness;
};
