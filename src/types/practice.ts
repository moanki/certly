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
  recentAttempts: PracticeRecentAttempt[];
  candidateName?: string;
  candidateEmail?: string;
  learnerId?: string;
  practiceSessionId?: string;
  blockNumber?: number;
  firstAttemptCorrect?: boolean;
  firstAttemptedAt?: string;
  reinforcementAttempts?: number;
  reinforcementCorrect?: number;
  reviewAttempts?: number;
};

export type PracticeRecentAttempt = {
  attemptedAt: string;
  correct: boolean;
  kind?: PracticeAttemptKind;
};

export type PracticeAttemptKind = "initial" | "reinforcement" | "review";

export type PracticeSessionQuestionProgress = {
  questionId: string;
  blockNumber: number;
  firstAttemptCorrect: boolean;
  reinforcementAttempts: number;
  reinforcementCorrect: number;
  reviewAttempts: number;
  previousCorrect: boolean;
};

export type PracticeSessionSummary = {
  id: string;
  startedAt: string | null;
  uniqueQuestions: number;
  totalAttempts: number;
  score: number | null;
  initiallyWrong: number;
  reinforcementAttempts: number;
  successfullyReinforced: number;
  stillStruggling: number;
  blockNumber: number;
  blockUniqueQuestions: number;
  blockTarget: number;
  blockScore: number | null;
  blockInitiallyWrong: number;
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

export type TopicPerformanceStatus = "Strong" | "Proficient" | "Developing" | "Needs Attention" | "Insufficient Data";

export type SubtopicPerformance = {
  name: string;
  mastery: number;
};

export type TopicPerformanceDetail = {
  topic: string;
  mastery: number | null;
  status: TopicPerformanceStatus;
  accuracy: number;
  coverage: number;
  recentPerformance: number;
  questionsAttempted: number;
  totalQuestions: number;
  totalAttempts: number;
  weakestSubtopics: SubtopicPerformance[];
};

export type TopicPerformanceSummary = {
  overallMastery: number | null;
  strongest: TopicPerformanceDetail[];
  needsAttention: TopicPerformanceDetail[];
  insufficientData: TopicPerformanceDetail[];
  topics: TopicPerformanceDetail[];
};

export type PracticeActivity = {
  historyByQuestion: Record<string, QuestionHistory>;
  readiness: ExamReadiness;
  topicPerformance: TopicPerformanceSummary;
  session: PracticeSessionSummary;
  sessionProgress: PracticeSessionQuestionProgress[];
};
