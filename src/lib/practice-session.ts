export type PracticeQueuePhase = "new" | "reinforcement" | "review";

export type PracticeQueueItem = {
  key: string;
  questionId: string;
  phase: PracticeQueuePhase;
  position: number;
  phaseTotal: number;
  blockNumber: number;
};

export type PracticeResumeItem = {
  questionId: string;
  blockNumber: number;
  firstAttemptCorrect: boolean;
  reinforcementAttempts: number;
  reinforcementCorrect: number;
  reviewAttempts: number;
  previousCorrect: boolean;
};

export type PracticeSessionQueue = {
  questionIds: string[];
  items: PracticeQueueItem[];
  nextUnseenIndex: number;
  reviewRound: number;
  reinforcementSequence: number;
  uniqueOffset: number;
  reviewedThrough: number;
  blockSize: number;
  totalQuestions: number;
};

const defaultBlockSize = 100;
const reinforcementGaps = [6, 18, 36];

export function normalizePracticeDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 40 ? name : null;
}

export function createPracticeSessionQueue(
  questionIds: string[],
  blockSize = defaultBlockSize,
  resume: PracticeResumeItem[] = [],
  totalUniqueAvailable = questionIds.length,
): PracticeSessionQueue {
  const safeBlockSize = Math.max(1, Math.floor(blockSize));
  const eligible = new Set(questionIds);
  const relevantResume = resume.filter((item) => eligible.has(item.questionId));
  const completed = new Set(relevantResume.map((item) => item.questionId));
  const unseenQuestionIds = questionIds.filter((questionId) => !completed.has(questionId));
  const uniqueOffset = resume.length;
  const boundaryBlock = Math.max(1, Math.ceil(uniqueOffset / safeBlockSize));
  const atBoundary = uniqueOffset > 0 && uniqueOffset % safeBlockSize === 0;
  const exhausted = uniqueOffset > 0 && uniqueOffset >= totalUniqueAvailable;
  const blockComplete = atBoundary || exhausted;
  const currentBlock = atBoundary ? boundaryBlock : Math.floor(uniqueOffset / safeBlockSize) + 1;
  const currentBlockProgress = relevantResume.filter((item) => item.blockNumber === currentBlock);
  const pendingReview = blockComplete
    ? currentBlockProgress.filter((item) => !item.firstAttemptCorrect && (item.reviewAttempts === 0 || !item.previousCorrect)).map((item) => item.questionId)
    : [];
  const remainingInBlock = blockComplete ? 0 : safeBlockSize - (uniqueOffset % safeBlockSize);
  const newCount = pendingReview.length ? 0 : Math.min(unseenQuestionIds.length, remainingInBlock);
  let session: PracticeSessionQueue = {
    questionIds: unseenQuestionIds,
    items: pendingReview.length
      ? createReviewItems(pendingReview, 1, currentBlock)
      : createNewItems(unseenQuestionIds.slice(0, newCount), uniqueOffset, questionIds.length, currentBlock),
    nextUnseenIndex: newCount,
    reviewRound: pendingReview.length ? 1 : 0,
    reinforcementSequence: 0,
    uniqueOffset,
    reviewedThrough: blockComplete ? uniqueOffset : uniqueOffset - (uniqueOffset % safeBlockSize),
    blockSize: safeBlockSize,
    totalQuestions: totalUniqueAvailable,
  };

  if (!pendingReview.length) {
    for (const item of currentBlockProgress.filter((progress) => !progress.firstAttemptCorrect && progress.reinforcementCorrect < 3)) {
      const remaining = Math.max(0, 3 - item.reinforcementCorrect);
      session = insertReinforcementItems(session, -1, item.questionId, reinforcementGaps.slice(0, remaining), item.blockNumber);
    }
  }
  return session;
}

export function schedulePracticeReinforcement(
  session: PracticeSessionQueue,
  currentIndex: number,
  isCorrect: boolean,
): PracticeSessionQueue {
  const item = session.items[currentIndex];
  if (!item) return session;
  if (item.phase === "new" && !isCorrect) {
    return insertReinforcementItems(session, currentIndex, item.questionId, reinforcementGaps, item.blockNumber);
  }
  if (item.phase === "reinforcement" && !isCorrect) {
    const nextSameQuestion = session.items.findIndex((candidate, index) => index > currentIndex && candidate.phase === "reinforcement" && candidate.questionId === item.questionId);
    if (nextSameQuestion === -1 || nextSameQuestion > currentIndex + 6) {
      return insertReinforcementItems(session, currentIndex, item.questionId, [4], item.blockNumber);
    }
  }
  return session;
}

export function advancePracticeSessionQueue(
  session: PracticeSessionQueue,
  unresolvedQuestionIds: string[],
  blockWrongQuestionIds: string[] = unresolvedQuestionIds,
): PracticeSessionQueue {
  const lastPhase = session.items.at(-1)?.phase;
  if (!lastPhase) return session;
  const uniqueThrough = session.uniqueOffset + session.nextUnseenIndex;

  if (session.reviewedThrough < uniqueThrough) {
    const currentBlock = Math.max(1, Math.ceil(uniqueThrough / session.blockSize));
    const currentBlockQuestionIds = new Set(session.items.filter((item) => item.phase === "new" && item.blockNumber === currentBlock).map((item) => item.questionId));
    const wrong = blockWrongQuestionIds.filter((questionId) => currentBlockQuestionIds.has(questionId));
    const reviewed = { ...session, reviewedThrough: uniqueThrough };
    return wrong.length ? appendReview(reviewed, wrong, currentBlock) : appendNextBlock(reviewed);
  }

  if (lastPhase === "review" && unresolvedQuestionIds.length > 0) {
    return appendReview(session, unresolvedQuestionIds, session.items.at(-1)?.blockNumber ?? 1);
  }

  return appendNextBlock(session);
}

export function practiceQueueEyebrow(item: PracticeQueueItem) {
  if (item.phase === "review") return `Review ${item.position} of ${item.phaseTotal}`;
  if (item.phase === "reinforcement") return `Reinforcement ${item.position} of ${item.phaseTotal}`;
  return `Question ${item.position} of ${item.phaseTotal}`;
}

function appendNextBlock(session: PracticeSessionQueue): PracticeSessionQueue {
  if (session.nextUnseenIndex >= session.questionIds.length) return session;
  const end = Math.min(session.questionIds.length, session.nextUnseenIndex + session.blockSize);
  const questionIds = session.questionIds.slice(session.nextUnseenIndex, end);
  const positionOffset = session.uniqueOffset + session.nextUnseenIndex;
  const blockNumber = Math.floor(positionOffset / session.blockSize) + 1;
  return {
    ...session,
    items: [...session.items, ...createNewItems(questionIds, positionOffset, session.totalQuestions, blockNumber)],
    nextUnseenIndex: end,
  };
}

function appendReview(session: PracticeSessionQueue, questionIds: string[], blockNumber: number): PracticeSessionQueue {
  const reviewRound = session.reviewRound + 1;
  return {
    ...session,
    items: [...session.items, ...createReviewItems(questionIds, reviewRound, blockNumber)],
    reviewRound,
  };
}

function createReviewItems(questionIds: string[], reviewRound: number, blockNumber: number): PracticeQueueItem[] {
  return questionIds.map((questionId, index) => ({
    key: `review:${reviewRound}:${index + 1}:${questionId}`,
    questionId,
    phase: "review",
    position: index + 1,
    phaseTotal: questionIds.length,
    blockNumber,
  }));
}

function insertReinforcementItems(
  session: PracticeSessionQueue,
  currentIndex: number,
  questionId: string,
  gaps: number[],
  blockNumber: number,
): PracticeSessionQueue {
  const items = [...session.items];
  let sequence = session.reinforcementSequence;
  let insertionAfter = currentIndex;
  for (const [index, gap] of gaps.entries()) {
    sequence += 1;
    const insertionIndex = Math.min(items.length, insertionAfter + gap + 1);
    items.splice(insertionIndex, 0, {
      key: `reinforcement:${sequence}:${questionId}`,
      questionId,
      phase: "reinforcement",
      position: index + 1,
      phaseTotal: gaps.length,
      blockNumber,
    });
    insertionAfter = insertionIndex;
  }
  return { ...session, items, reinforcementSequence: sequence };
}

function createNewItems(questionIds: string[], offset: number, total: number, blockNumber: number): PracticeQueueItem[] {
  return questionIds.map((questionId, index) => ({
    key: `new:${offset + index + 1}:${questionId}`,
    questionId,
    phase: "new",
    position: offset + index + 1,
    phaseTotal: total,
    blockNumber,
  }));
}
