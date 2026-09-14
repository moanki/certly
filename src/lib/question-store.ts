import "server-only";

import { Query } from "node-appwrite";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import staticQuestionBank from "@/lib/static-question-bank.json";
import type { ExamQuestion } from "@/types/exam";

const fallbackQuestions = staticQuestionBank as unknown as ExamQuestion[];

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
    return questions.length ? questions : fallbackQuestions;
  } catch {
    return fallbackQuestions;
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
