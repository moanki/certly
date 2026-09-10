import { ID, Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";

type AttemptPayload = {
  candidate: { name: string; email: string };
  certificationId: string;
  mode: "exam" | "practice";
  timed: boolean;
  startedAt: string;
  submittedAt: string;
  score: number;
  passed: boolean;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  durationSeconds: number;
  answers: Array<{
    questionId: string;
    selectedOptionIds: string[];
    timeSpentSeconds: number;
    markedForReview: boolean;
    isCorrect: boolean;
  }>;
};

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim();
  if (!email) return Response.json({ attempts: [] });

  try {
    const { databases } = createAdminClient();
    const result = await databases.listDocuments({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.attemptsCollectionId,
      queries: [Query.equal("candidateEmail", [email]), Query.orderDesc("submittedAt"), Query.limit(10)],
    });
    return Response.json({
      attempts: result.documents.map((document) => ({
        id: document.$id,
        submittedAt: document.submittedAt,
        score: document.score,
        passed: document.passed,
        correct: document.correct,
        total: document.total,
        durationSeconds: document.durationSeconds,
      })),
    });
  } catch {
    return Response.json({ attempts: [] });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AttemptPayload;
    if (!payload.candidate.name.trim() || !payload.startedAt || !Array.isArray(payload.answers)) {
      return Response.json({ error: "Attempt data is incomplete." }, { status: 400 });
    }

    const { databases } = createAdminClient();
    const attempt = await databases.createDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.attemptsCollectionId,
      documentId: ID.unique(),
      data: {
        candidateName: payload.candidate.name.trim(),
        candidateEmail: payload.candidate.email.trim(),
        certificationId: payload.certificationId,
        mode: payload.mode,
        timed: payload.timed,
        startedAt: payload.startedAt,
        submittedAt: payload.submittedAt,
        score: payload.score,
        passed: payload.passed,
        correct: payload.correct,
        incorrect: payload.incorrect,
        unanswered: payload.unanswered,
        total: payload.total,
        durationSeconds: payload.durationSeconds,
      },
    });

    await Promise.all(payload.answers.map((answer) => databases.createDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.answersCollectionId,
      documentId: ID.unique(),
      data: { attemptId: attempt.$id, ...answer },
    })));

    return Response.json({ attemptId: attempt.$id }, { status: 201 });
  } catch {
    return Response.json({ error: "The attempt could not be saved." }, { status: 500 });
  }
}
