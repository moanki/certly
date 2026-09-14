import { describe, expect, it } from "vitest";
import { serializeAttemptPayload } from "@/lib/attempt-persistence";

describe("attempt persistence", () => {
  it("keeps detailed answers when the payload fits", () => {
    const stored = JSON.parse(serializeAttemptPayload({ candidateName: "Learner", answers: [{ questionId: "q1" }] }, ["key-1"]));
    expect(stored.answers).toHaveLength(1);
    expect(stored.questionKeys).toEqual(["key-1"]);
  });

  it("keeps analytics and unique question keys when a 250-answer payload is too large", () => {
    const answers = Array.from({ length: 250 }, (_, index) => ({ questionId: `question-${index}`, selectedOptionIds: ["option-a"], timeSpentSeconds: 20 }));
    const questionKeys = Array.from({ length: 250 }, (_, index) => `key-${index}`);
    const stored = JSON.parse(serializeAttemptPayload({ candidateName: "Learner", score: 800, total: 250, answers }, questionKeys, 4_000));

    expect(stored.answers).toBeUndefined();
    expect(stored).toMatchObject({ candidateName: "Learner", score: 800, total: 250 });
    expect(stored.questionKeys).toHaveLength(250);
  });
});
