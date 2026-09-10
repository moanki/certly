import { ID } from "node-appwrite";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { parseDelimitedAnswers } from "@/lib/exam-engine";
import type { ImportPreviewQuestion } from "@/types/exam";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as { questions?: ImportPreviewQuestion[] };
    const questions = body.questions ?? [];
    if (questions.length === 0) {
      return Response.json({ error: "There are no reviewed questions to import." }, { status: 400 });
    }

    const { databases } = createAdminClient();
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

    return Response.json({ importedCount: questions.length });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") {
      return Response.json({ error: "Admin sign-in is required." }, { status: 401 });
    }
    return Response.json({ error: "The reviewed questions could not be imported." }, { status: 500 });
  }
}
