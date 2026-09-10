import { Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import type { ExamQuestion, QuestionOption } from "@/types/exam";

export async function GET() {
  try {
    const { databases } = createAdminClient();
    const result = await databases.listDocuments({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.questionsCollectionId,
      queries: [Query.equal("status", ["active"]), Query.limit(500)],
    });
    const questions = result.documents.flatMap((document) => {
      try {
        const options = JSON.parse(String(document.optionsJson)) as QuestionOption[];
        const question: ExamQuestion = {
          id: document.$id,
          certificationId: String(document.certificationId),
          examVersion: String(document.examVersion),
          topic: String(document.topic),
          subtopic: String(document.subtopic),
          difficulty: document.difficulty as ExamQuestion["difficulty"],
          type: document.type as ExamQuestion["type"],
          text: String(document.text),
          options,
          explanation: String(document.explanation ?? ""),
          sourceType: document.sourceType as ExamQuestion["sourceType"],
          sourceReference: String(document.sourceReference ?? ""),
        };
        return [question];
      } catch {
        return [];
      }
    });
    return Response.json({ questions });
  } catch {
    return Response.json({ questions: [] });
  }
}
