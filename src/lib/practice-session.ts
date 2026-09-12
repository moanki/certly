export type PracticeQueueItem = {
  key: string;
  questionId: string;
  phase: "new" | "review";
  position: number;
  phaseTotal: number;
};

export type PracticeSessionQueue = {
  questionIds: string[];
  items: PracticeQueueItem[];
  nextUnseenIndex: number;
  reviewRound: number;
};

const defaultBlockSize = 100;

export function createPracticeSessionQueue(questionIds: string[], blockSize = defaultBlockSize): PracticeSessionQueue {
  const safeBlockSize = Math.max(1, Math.floor(blockSize));
  const nextUnseenIndex = Math.min(questionIds.length, safeBlockSize);
  return {
    questionIds: [...questionIds],
    items: createNewItems(questionIds.slice(0, nextUnseenIndex), 0, questionIds.length),
    nextUnseenIndex,
    reviewRound: 0,
  };
}

export function advancePracticeSessionQueue(
  session: PracticeSessionQueue,
  unresolvedQuestionIds: string[],
  blockSize = defaultBlockSize,
): PracticeSessionQueue {
  const lastPhase = session.items.at(-1)?.phase;
  if (!lastPhase) return session;

  if (lastPhase === "new" && unresolvedQuestionIds.length > 0) {
    return appendReview(session, unresolvedQuestionIds);
  }

  if (session.nextUnseenIndex < session.questionIds.length) {
    const safeBlockSize = Math.max(1, Math.floor(blockSize));
    const end = Math.min(session.questionIds.length, session.nextUnseenIndex + safeBlockSize);
    const questionIds = session.questionIds.slice(session.nextUnseenIndex, end);
    return {
      ...session,
      items: [...session.items, ...createNewItems(questionIds, session.nextUnseenIndex, session.questionIds.length)],
      nextUnseenIndex: end,
    };
  }

  if (lastPhase === "review" && unresolvedQuestionIds.length > 0) {
    return appendReview(session, unresolvedQuestionIds);
  }

  return session;
}

export function practiceQueueEyebrow(item: PracticeQueueItem) {
  return item.phase === "review"
    ? `Review ${item.position} of ${item.phaseTotal}`
    : `Question ${item.position} of ${item.phaseTotal}`;
}

function appendReview(session: PracticeSessionQueue, unresolvedQuestionIds: string[]): PracticeSessionQueue {
  const reviewRound = session.reviewRound + 1;
  const phaseTotal = unresolvedQuestionIds.length;
  const items = unresolvedQuestionIds.map((questionId, index): PracticeQueueItem => ({
    key: `review:${reviewRound}:${index + 1}:${questionId}`,
    questionId,
    phase: "review",
    position: index + 1,
    phaseTotal,
  }));
  return { ...session, items: [...session.items, ...items], reviewRound };
}

function createNewItems(questionIds: string[], offset: number, total: number): PracticeQueueItem[] {
  return questionIds.map((questionId, index) => ({
    key: `new:${offset + index + 1}:${questionId}`,
    questionId,
    phase: "new",
    position: offset + index + 1,
    phaseTotal: total,
  }));
}
