export type AdminPerformancePoint = {
  attemptedAt: string;
  attemptNumber: number;
  score: number;
};

export type AdminPerformanceSeries = {
  userId: string;
  name: string;
  points: AdminPerformancePoint[];
};

export type AdminScoreboardEntry = {
  userId: string;
  name: string;
  latestAttemptedAt: string;
  questionsAttempted: number;
  uniqueQuestionsAttempted: number;
  totalScore: number;
  completedAttempts: number;
};

export type AdminScoreboard = {
  scoreScale: number;
  leaders: AdminScoreboardEntry[];
  series: AdminPerformanceSeries[];
};

export type AdminPerformanceDashboard = {
  practice: AdminScoreboard;
  exam: AdminScoreboard;
};
