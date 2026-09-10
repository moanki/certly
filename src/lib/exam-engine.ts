import type {
  AttemptAnswer,
  AttemptSummary,
  ExamPreset,
  ExamQuestion,
  ImportPreviewQuestion,
  QuestionType,
  TopicSummary,
} from "@/types/exam";

export const hcipHuaweiPreset: ExamPreset = {
  id: "hcip-dcf-huawei-style",
  certificationId: "hcip-dcf",
  title: "HCIP-Datacenter Facility Deployment Huawei-style Mock",
  questionCount: 60,
  durationMinutes: 90,
  scoreScale: 1000,
  passingScore: 600,
  exactMultipleAnswerScoring: true,
  negativeMarkingEnabled: false,
};

export function normalizeQuestionCount(available: number, requested = hcipHuaweiPreset.questionCount) {
  return Math.min(Math.max(1, requested), available);
}

export function getCorrectOptionIds(question: ExamQuestion) {
  return question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id)
    .sort();
}

export function isAnswerCorrect(question: ExamQuestion, selectedOptionIds: string[]) {
  const selected = [...selectedOptionIds].sort();
  const correct = getCorrectOptionIds(question);

  return selected.length === correct.length && correct.every((id, index) => id === selected[index]);
}

export function scoreAttempt(
  questions: ExamQuestion[],
  answers: AttemptAnswer[],
  preset: ExamPreset = hcipHuaweiPreset,
): AttemptSummary {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const results = questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const selectedOptionIds = answer?.selectedOptionIds ?? [];
    const isAnswered = selectedOptionIds.length > 0;

    return {
      question,
      selectedOptionIds,
      isCorrect: isAnswered && isAnswerCorrect(question, selectedOptionIds),
      isAnswered,
      timeSpentSeconds: answer?.timeSpentSeconds ?? 0,
    };
  });

  const correct = results.filter((result) => result.isCorrect).length;
  const unanswered = results.filter((result) => !result.isAnswered).length;
  const incorrect = questions.length - correct - unanswered;
  const percent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  const score = questions.length ? Math.round((correct / questions.length) * preset.scoreScale) : 0;

  return {
    score,
    percent,
    passed: score >= preset.passingScore,
    correct,
    incorrect,
    unanswered,
    total: questions.length,
    byTopic: summarizeTopics(results),
    results,
  };
}

export function summarizeTopics(results: AttemptSummary["results"]): TopicSummary[] {
  const byTopic = new Map<string, { total: number; correct: number }>();

  for (const result of results) {
    const current = byTopic.get(result.question.topic) ?? { total: 0, correct: 0 };
    current.total += 1;
    current.correct += result.isCorrect ? 1 : 0;
    byTopic.set(result.question.topic, current);
  }

  return [...byTopic.entries()].map(([topic, value]) => {
    const percent = Math.round((value.correct / value.total) * 100);
    return {
      topic,
      total: value.total,
      correct: value.correct,
      percent,
      status: percent >= 85 ? "Strong" : percent >= 70 ? "Developing" : "Weak",
    };
  });
}

export function shuffleWithSeed<T>(items: T[], seed: string) {
  const copy = [...items];
  let state = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function parseQuestionType(raw: string): QuestionType {
  const value = raw.trim().toLowerCase().replaceAll("-", "_");
  if (["multiple", "multi", "multiple_answer"].includes(value)) {
    return "multiple";
  }
  if (["true_false", "true/false", "tf"].includes(value)) {
    return "true_false";
  }
  return "single";
}

export function parseDelimitedAnswers(raw: string) {
  const normalized = raw
    .toUpperCase()
    .replace(/\bOPTIONS?\b/g, "")
    .replace(/\bAND\b/g, ",")
    .replace(/[()[\]{}]/g, " ")
    .trim();
  const compact = normalized.replace(/[\s,;|/]+/g, "");
  if (!/^[A-H]+$/.test(compact)) return [];
  return [...new Set(compact)];
}

export function coerceImportRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row): ImportPreviewQuestion | null => {
      const question = stringValue(row.question ?? row.Question ?? row.question_text);
      if (!question) {
        return null;
      }

      return {
        topic: stringValue(row.topic ?? row.Topic) || "Unassigned",
        subtopic: stringValue(row.subtopic ?? row.Subtopic) || "General",
        type: parseQuestionType(stringValue(row.type ?? row.Type)),
        question,
        options: ["a", "b", "c", "d", "e", "f"]
          .map((key) => stringValue(row[`option_${key}`] ?? row[`Option_${key.toUpperCase()}`]))
          .filter(Boolean),
        answer: stringValue(row.answer ?? row.Answer),
        explanation: stringValue(row.explanation ?? row.Explanation),
        sourceReference: stringValue(row.source ?? row.Source ?? row.source_reference),
      };
    })
    .filter((row): row is ImportPreviewQuestion => Boolean(row));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
