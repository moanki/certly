import { describe, expect, it } from "vitest";
import { advancePracticeSessionQueue, createPracticeSessionQueue, practiceQueueEyebrow } from "@/lib/practice-session";

describe("practice session queue", () => {
  const ids = Array.from({ length: 250 }, (_, index) => `q${index + 1}`);

  it("starts with the first 100 unseen questions", () => {
    const session = createPracticeSessionQueue(ids);
    expect(session.items).toHaveLength(100);
    expect(session.items[0]).toMatchObject({ questionId: "q1", phase: "new", position: 1, phaseTotal: 250 });
    expect(session.items.at(-1)?.questionId).toBe("q100");
    expect(session.nextUnseenIndex).toBe(100);
  });

  it("reviews incorrect questions in first-wrong order before adding unseen questions", () => {
    const firstBlock = createPracticeSessionQueue(ids);
    const review = advancePracticeSessionQueue(firstBlock, ["q2", "q50", "q99"]);
    expect(review.items.slice(100).map((item) => item.questionId)).toEqual(["q2", "q50", "q99"]);
    expect(review.items.slice(100).every((item) => item.phase === "review")).toBe(true);

    const secondBlock = advancePracticeSessionQueue(review, ["q50"]);
    expect(secondBlock.items.slice(103)).toHaveLength(100);
    expect(secondBlock.items[103].questionId).toBe("q101");
    expect(secondBlock.items.at(-1)?.questionId).toBe("q200");
  });

  it("carries unresolved review questions into the next checkpoint", () => {
    let session = createPracticeSessionQueue(ids);
    session = advancePracticeSessionQueue(session, ["q2"]);
    session = advancePracticeSessionQueue(session, ["q2"]);
    session = advancePracticeSessionQueue(session, ["q2", "q150"]);
    expect(session.items.slice(-2).map((item) => item.questionId)).toEqual(["q2", "q150"]);
  });

  it("skips an empty review and continues with new questions", () => {
    const session = advancePracticeSessionQueue(createPracticeSessionQueue(ids), []);
    expect(session.items).toHaveLength(200);
    expect(session.items[100].questionId).toBe("q101");
  });

  it("reviews the final partial block and repeats only unresolved final items", () => {
    let session = createPracticeSessionQueue(ids);
    session = advancePracticeSessionQueue(session, []);
    session = advancePracticeSessionQueue(session, []);
    expect(session.items.at(-1)?.questionId).toBe("q250");

    session = advancePracticeSessionQueue(session, ["q230", "q249"]);
    expect(session.items.slice(-2).map((item) => item.questionId)).toEqual(["q230", "q249"]);

    session = advancePracticeSessionQueue(session, ["q249"]);
    expect(session.items.at(-1)).toMatchObject({ questionId: "q249", phase: "review", position: 1, phaseTotal: 1 });
    expect(advancePracticeSessionQueue(session, []).items).toHaveLength(session.items.length);
  });

  it("labels new and review occurrences independently", () => {
    let session = createPracticeSessionQueue(ids);
    expect(practiceQueueEyebrow(session.items[0])).toBe("Question 1 of 250");
    session = advancePracticeSessionQueue(session, ["q4", "q8"]);
    expect(practiceQueueEyebrow(session.items[100])).toBe("Review 1 of 2");
  });
});
