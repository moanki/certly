export function serializeAttemptPayload<T extends { answers: unknown[] }>(attempt: T, questionKeys: string[], maximumLength = 15_000) {
  const full = JSON.stringify({ ...attempt, questionKeys });
  if (full.length <= maximumLength) return full;

  const compact = JSON.stringify({ ...attempt, answers: undefined, questionKeys });
  if (compact.length <= maximumLength) return compact;
  throw new Error("Attempt payload exceeds storage limit.");
}
