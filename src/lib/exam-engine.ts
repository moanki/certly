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
  questionCount: 100,
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

export function describeAnswerResult(question: ExamQuestion, selectedOptionIds: string[]) {
  const selected = new Set(selectedOptionIds);
  const correctIds = new Set(getCorrectOptionIds(question));
  const incorrectSelected = question.options.filter((option) => selected.has(option.id) && !correctIds.has(option.id));
  const missedCorrect = question.options.filter((option) => !selected.has(option.id) && correctIds.has(option.id));

  if (incorrectSelected.length === 0 && missedCorrect.length === 0) {
    return "Your selection exactly matches every correct answer and includes no incorrect options.";
  }

  const reasons = [];
  if (incorrectSelected.length > 0) {
    reasons.push(`You selected ${formatOptionLabels(incorrectSelected)}, which ${incorrectSelected.length === 1 ? "is" : "are"} not part of the correct answer.`);
  }
  if (missedCorrect.length > 0) {
    reasons.push(`You missed ${formatOptionLabels(missedCorrect)}, which ${missedCorrect.length === 1 ? "is" : "are"} required.`);
  }
  return reasons.join(" ");
}

export function explainCorrectAnswer(question: ExamQuestion) {
  const authoredExplanation = question.explanation.trim();
  if (authoredExplanation) return authoredExplanation;

  const correctOptions = question.options.filter((option) => option.isCorrect);
  const rationales = correctOptions
    .map((option) => option.rationale?.trim())
    .filter((rationale): rationale is string => Boolean(rationale));
  if (rationales.length > 0) return rationales.join(" ");

  const labels = formatOptionLabels(correctOptions);
  const statements = correctOptions.map((option) => `${option.label} states that ${sentenceFragment(option.text)}`);
  if (question.type === "multiple") {
    return `${labels} form the complete correct set for this ${question.topic} question. ${formatList(statements)}; together, these points satisfy every part of the question.`;
  }
  if (question.type === "true_false") {
    return `${labels} is correct because the statement is ${correctOptions[0]?.text.toLowerCase() === "true" ? "accurate" : "not accurate"} in the ${question.topic} context covered by this question.`;
  }
  return `${labels} is correct because ${sentenceFragment(correctOptions[0]?.text ?? "this option")} directly matches what the ${question.topic} question asks.`;
}

function formatOptionLabels(options: ExamQuestion["options"]) {
  return options.map((option) => option.label).join(", ");
}

function sentenceFragment(value: string) {
  const normalized = value.trim().replace(/[.!?]+$/, "");
  if (!normalized) return "the marked answer";
  if (/^[A-Z]{2}/.test(normalized)) return normalized;
  return normalized[0].toLowerCase() + normalized.slice(1);
}

function formatList(values: string[]) {
  if (values.length < 2) return values[0] ?? "The marked options apply";
  if (values.length === 2) return `${values[0]}, and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
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

export function dedupeImportQuestions(questions: ImportPreviewQuestion[], existingQuestionTexts: string[] = []) {
  const seen = new Set(existingQuestionTexts.map(normalizeQuestionText));
  return questions.filter((question) => {
    const key = normalizeQuestionText(question.question);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQuestionText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
