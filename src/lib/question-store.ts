import "server-only";

import { Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { sampleQuestions } from "@/lib/questions";
import type { ExamQuestion } from "@/types/exam";

export async function loadActiveQuestions(): Promise<ExamQuestion[]> {
  try {
    const { tables } = createAdminClient();
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = await tables.listRows({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.questionsCollectionId,
        queries: [Query.equal("status", ["active"]), Query.limit(500), Query.offset(offset)],
      });
      rows.push(...page.rows);
      if (page.rows.length < 500) break;
    }
    const questions = rows.flatMap((row) => {
      try {
        const payload = JSON.parse(String(row.payloadJson)) as Omit<ExamQuestion, "id" | "certificationId" | "topic">;
        if (!Array.isArray(payload.options) || payload.options.length < 2 || payload.options.length > 10) return [];
        const question: ExamQuestion = {
          ...payload,
          id: row.$id,
          certificationId: String(row.certificationId),
          topic: String(row.topic),
        };
        return [question];
      } catch {
        return [];
      }
    });
    return questions.length ? questions : sampleQuestions;
  } catch {
    return sampleQuestions;
  }
}

export function redactQuestion(question: ExamQuestion): ExamQuestion {
  return {
    ...question,
    explanation: "",
    sourceReference: "",
    options: question.options.map(({ id, label, text }) => ({ id, label, text, isCorrect: false })),
  };
}
