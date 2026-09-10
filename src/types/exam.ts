export type QuestionType = "single" | "multiple" | "true_false";

export type QuestionOption = {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  rationale?: string;
};

export type ExamQuestion = {
  id: string;
  certificationId: string;
  examVersion: string;
  topic: string;
  subtopic: string;
  difficulty: "foundation" | "intermediate" | "advanced";
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  explanation: string;
  sourceType: "huawei_material" | "mock_exam" | "generated_practice";
  sourceReference: string;
};

export type ExamPreset = {
  id: string;
  certificationId: string;
  title: string;
  questionCount: number;
  durationMinutes: number;
  scoreScale: number;
  passingScore: number;
  exactMultipleAnswerScoring: boolean;
  negativeMarkingEnabled: boolean;
};

export type Candidate = {
  name: string;
  email: string;
};

export type AttemptAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  timeSpentSeconds: number;
  markedForReview: boolean;
};

export type QuestionResult = {
  question: ExamQuestion;
  selectedOptionIds: string[];
  isCorrect: boolean;
  isAnswered: boolean;
  timeSpentSeconds: number;
};

export type TopicSummary = {
  topic: string;
  total: number;
  correct: number;
  percent: number;
  status: "Strong" | "Developing" | "Weak";
};

export type AttemptSummary = {
  score: number;
  percent: number;
  passed: boolean;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  byTopic: TopicSummary[];
  results: QuestionResult[];
};

export type ImportPreviewQuestion = {
  topic: string;
  subtopic: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  sourceReference: string;
};
