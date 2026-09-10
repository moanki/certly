import { ID } from "node-appwrite";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { parseDelimitedAnswers } from "@/lib/exam-engine";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson, securityLog } from "@/lib/security";
import type { ImportPreviewQuestion } from "@/types/exam";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, 2 * 1024 * 1024);
  if (sizeError) return sizeError;
  const rateLimitError = enforceRateLimit(request, "admin-import-commit", 20, 60 * 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(id)) {
      return noStoreJson({ error: "Import identifier is invalid." }, { status: 400 });
    }
    const body = (await request.json()) as { questions?: ImportPreviewQuestion[] };
    const questions = body.questions ?? [];
    if (questions.length === 0 || questions.length > 500 || questions.some((question) => !isValidQuestion(question))) {
      return noStoreJson({ error: "There are no valid reviewed questions to import." }, { status: 400 });
    }

    const { databases } = createAdminClient();
    const importRecord = await databases.getDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.importsCollectionId,
      documentId: id,
    });
    if (importRecord.status !== "preview") {
      return noStoreJson({ error: "This import has already been processed." }, { status: 409 });
    }
    await Promise.all(questions.map((question) => {
      const correctLabels = new Set(parseDelimitedAnswers(question.answer));
      const options = question.options.map((text, index) => {
        const label = String.fromCharCode(65 + index);
        return { id: label.toLowerCase(), label, text, isCorrect: correctLabels.has(label), rationale: "" };
      });
      return databases.createDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.questionsCollectionId,
        documentId: ID.unique(),
        data: {
          certificationId: "hcip-dcf",
          examVersion: "HCIP-DCF mock v1",
          topic: question.topic || "Unassigned",
          subtopic: question.subtopic || "General",
          difficulty: "intermediate",
          type: question.type,
          text: question.question,
          optionsJson: JSON.stringify(options),
          explanation: question.explanation,
          sourceType: "mock_exam",
          sourceReference: question.sourceReference,
          status: "active",
        },
      });
    }));
    await databases.updateDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.importsCollectionId,
      documentId: id,
      data: { status: "imported", detectedCount: questions.length },
    });

    securityLog("question_import_committed", { count: questions.length });
    return noStoreJson({ importedCount: questions.length });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") {
      securityLog("question_import_commit_unauthorized");
      return noStoreJson({ error: "Admin sign-in is required." }, { status: 401 });
    }
    return noStoreJson({ error: "The reviewed questions could not be imported." }, { status: 400 });
  }
}

function isValidQuestion(question: ImportPreviewQuestion) {
  if (!question || !["single", "multiple", "true_false"].includes(question.type)) return false;
  const correctLabels = parseDelimitedAnswers(question.answer);
  const validLabels = new Set(question.options.map((_, index) => String.fromCharCode(65 + index)));
  return question.question.length >= 5
    && question.question.length <= 10_000
    && question.topic.length <= 120
    && question.subtopic.length <= 120
    && question.explanation.length <= 10_000
    && question.sourceReference.length <= 300
    && question.options.length >= 2
    && question.options.length <= 10
    && question.options.every((option) => option.length >= 1 && option.length <= 2_000)
    && correctLabels.length >= 1
    && correctLabels.every((label) => validLabels.has(label));
}
