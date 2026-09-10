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

    const { tables } = createAdminClient();
    const importRecord = await tables.getRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.importsCollectionId,
      rowId: id,
    });
    if (importRecord.kind !== "import" || importRecord.status !== "preview") {
      return noStoreJson({ error: "This import has already been processed." }, { status: 409 });
    }
    await Promise.all(questions.map((question) => {
      const correctLabels = new Set(parseDelimitedAnswers(question.answer));
      const options = question.options.map((text, index) => {
        const label = String.fromCharCode(65 + index);
        return { id: label.toLowerCase(), label, text, isCorrect: correctLabels.has(label), rationale: "" };
      });
      const payloadJson = JSON.stringify({
        examVersion: "HCIP-DCF mock v1",
        subtopic: question.subtopic || "General",
        difficulty: "intermediate",
        type: question.type,
        text: question.question,
        options,
        explanation: question.explanation,
        sourceType: "mock_exam",
        sourceReference: question.sourceReference,
      });
      if (payloadJson.length > 15_000) throw new Error("Question payload exceeds storage limit.");
      return tables.createRow({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.questionsCollectionId,
        rowId: ID.unique(),
        data: {
          certificationId: "hcip-dcf",
          topic: question.topic || "Unassigned",
          status: "active",
          payloadJson,
        },
      });
    }));
    await tables.updateRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.importsCollectionId,
      rowId: id,
      data: { status: "imported" },
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
    && question.question.length <= 3_000
    && question.topic.length <= 120
    && question.subtopic.length <= 120
    && question.explanation.length <= 2_000
    && question.sourceReference.length <= 300
    && question.options.length >= 2
    && question.options.length <= 10
    && question.options.every((option) => option.length >= 1 && option.length <= 600)
    && correctLabels.length >= 1
    && correctLabels.every((label) => validLabels.has(label));
}
