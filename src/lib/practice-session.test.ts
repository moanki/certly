import { describe, expect, it } from "vitest";
import { advancePracticeSessionQueue, createPracticeSessionQueue, normalizePracticeDisplayName, practiceQueueEyebrow, schedulePracticeReinforcement } from "@/lib/practice-session";

describe("practice session queue", () => {
  const ids = Array.from({ length: 250 }, (_, index) => `q${index + 1}`);

  it("starts with the first 100 unique questions", () => {
    const session = createPracticeSessionQueue(ids);
    expect(session.items).toHaveLength(100);
    expect(session.items[0]).toMatchObject({ questionId: "q1", phase: "new", position: 1, blockNumber: 1 });
    expect(session.items.at(-1)?.questionId).toBe("q100");
    expect(session.nextUnseenIndex).toBe(100);
  });

  it("requires and normalizes a reasonable learner display name", () => {
    expect(normalizePracticeDisplayName("  Mohamed   Eeman  ")).toBe("Mohamed Eeman");
    expect(normalizePracticeDisplayName(" ")).toBeNull();
    expect(normalizePracticeDisplayName("A")).toBeNull();
    expect(normalizePracticeDisplayName("A".repeat(41))).toBeNull();
  });

  it("schedules three spaced recalls after an initial wrong answer", () => {
    const session = schedulePracticeReinforcement(createPracticeSessionQueue(ids), 0, false);
    const repeats = session.items.map((item, index) => ({ item, index })).filter(({ item }) => item.questionId === "q1" && item.phase === "reinforcement");
    expect(repeats).toHaveLength(3);
    expect(repeats.map(({ index }) => index)).toEqual([7, 26, 63]);
  });

  it("keeps planned recalls after a correct reinforcement and shortens a wrong interval", () => {
    let session = schedulePracticeReinforcement(createPracticeSessionQueue(ids), 0, false);
    const firstRepeat = session.items.findIndex((item) => item.questionId === "q1" && item.phase === "reinforcement");
    const afterCorrect = schedulePracticeReinforcement(session, firstRepeat, true);
    expect(afterCorrect.items.filter((item) => item.questionId === "q1" && item.phase === "reinforcement")).toHaveLength(3);

    session = schedulePracticeReinforcement(session, firstRepeat, false);
    const nextRepeat = session.items.findIndex((item, index) => index > firstRepeat && item.questionId === "q1" && item.phase === "reinforcement");
    expect(nextRepeat - firstRepeat).toBeLessThanOrEqual(5);
  });

  it("reviews wrong questions after 100 unique questions before adding Q101", () => {
    const firstBlock = createPracticeSessionQueue(ids);
    const review = advancePracticeSessionQueue(firstBlock, ["q2"], ["q2", "q50"]);
    expect(review.items.slice(100).map((item) => item.questionId)).toEqual(["q2", "q50"]);
    expect(review.items.slice(100).every((item) => item.phase === "review")).toBe(true);

    const secondBlock = advancePracticeSessionQueue(review, []);
    expect(secondBlock.items[102]).toMatchObject({ questionId: "q101", phase: "new", blockNumber: 2 });
  });

  it("resumes with unseen questions and pending block review", () => {
    const progress = ids.slice(0, 100).map((questionId, index) => ({
      questionId,
      blockNumber: 1,
      firstAttemptCorrect: index !== 4,
      reinforcementAttempts: index === 4 ? 3 : 0,
      reinforcementCorrect: index === 4 ? 3 : 0,
      reviewAttempts: 0,
      previousCorrect: true,
    }));
    const session = createPracticeSessionQueue(ids, 100, progress);
    expect(session.items).toHaveLength(1);
    expect(session.items[0]).toMatchObject({ questionId: "q5", phase: "review" });
    const next = advancePracticeSessionQueue(session, []);
    expect(next.items[1]).toMatchObject({ questionId: "q101", phase: "new" });
  });

  it("resumes the final partial block in review instead of losing it", () => {
    const progress = ids.map((questionId, index) => ({
      questionId,
      blockNumber: Math.floor(index / 100) + 1,
      firstAttemptCorrect: index !== 249,
      reinforcementAttempts: index === 249 ? 3 : 0,
      reinforcementCorrect: index === 249 ? 3 : 0,
      reviewAttempts: 0,
      previousCorrect: true,
    }));

    const session = createPracticeSessionQueue(ids, 100, progress);
    expect(session.items).toHaveLength(1);
    expect(session.items[0]).toMatchObject({ questionId: "q250", phase: "review", blockNumber: 3 });
  });

  it("finishes a partial active block without counting repeats as unique", () => {
    const progress = ids.slice(0, 46).map((questionId) => ({
      questionId,
      blockNumber: 1,
      firstAttemptCorrect: true,
      reinforcementAttempts: 0,
      reinforcementCorrect: 0,
      reviewAttempts: 0,
      previousCorrect: true,
    }));
    const session = createPracticeSessionQueue(ids, 100, progress);
    expect(session.items.filter((item) => item.phase === "new")).toHaveLength(54);
    expect(session.items[0]).toMatchObject({ questionId: "q47", position: 47 });
  });

  it("labels new, reinforcement, and review occurrences independently", () => {
    let session = createPracticeSessionQueue(ids);
    expect(practiceQueueEyebrow(session.items[0])).toBe("Question 1 of 250");
    session = schedulePracticeReinforcement(session, 0, false);
    expect(practiceQueueEyebrow(session.items[7])).toBe("Reinforcement 1 of 3");
    session = advancePracticeSessionQueue(session, ["q1"], ["q1"]);
    expect(practiceQueueEyebrow(session.items.at(-1)!)).toBe("Review 1 of 1");
  });
});
