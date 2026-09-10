import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { extractLooseQuestionsFromText, parseCsvImport } from "@/lib/importers";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson, securityLog } from "@/lib/security";
import type { ImportPreviewQuestion } from "@/types/exam";

export const runtime = "nodejs";

const maxFileSize = 10 * 1024 * 1024;
const maxCsvSize = 2 * 1024 * 1024;
const maxQuestions = 500;

export async function POST(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, maxFileSize + 128 * 1024);
  if (sizeError) return sizeError;
  const rateLimitError = enforceRateLimit(request, "admin-import", 20, 60 * 60 * 1_000);
  if (rateLimitError) return rateLimitError;

  try {
    const admin = await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return noStoreJson({ error: "Choose a PDF or CSV file." }, { status: 400 });
    }
    if (file.size > maxFileSize) {
      return noStoreJson({ error: "The file must be 10 MB or smaller." }, { status: 413 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "csv") {
      return noStoreJson({ error: "Only PDF and CSV files are supported in this release." }, { status: 415 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const safeFileName = sanitizeFileName(file.name);
    let questions: ImportPreviewQuestion[];
    if (extension === "csv") {
      if (file.size > maxCsvSize || !isSafeCsv(bytes, file.type)) {
        return noStoreJson({ error: "The CSV file type or content is invalid." }, { status: 415 });
      }
      questions = parseCsvImport(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } else {
      if (!isPdf(bytes, file.type)) {
        return noStoreJson({ error: "The PDF file type or content is invalid." }, { status: 415 });
      }
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      try {
        const parsed = await parser.getText();
        questions = extractLooseQuestionsFromText(parsed.text);
      } finally {
        await parser.destroy();
      }
    }
    if (questions.length < 1 || questions.length > maxQuestions || questions.some((question) => !isValidQuestion(question))) {
      return noStoreJson({ error: "The file does not contain a valid, bounded question set." }, { status: 422 });
    }

    const { databases, storage } = createAdminClient();
    const storedFile = await storage.createFile({
      bucketId: appwriteConfig.importsBucketId,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(bytes, safeFileName),
    });
    const importRecord = await databases.createDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.importsCollectionId,
      documentId: ID.unique(),
      data: {
        fileId: storedFile.$id,
        fileName: safeFileName,
        status: "preview",
        detectedCount: questions.length,
        uploadedBy: admin.email,
      },
    });

    securityLog("question_import_preview_created", { count: questions.length });
    return noStoreJson({ importId: importRecord.$id, questions });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") {
      securityLog("question_import_unauthorized");
      return noStoreJson({ error: "Admin sign-in is required." }, { status: 401 });
    }
    return noStoreJson({ error: "The file could not be parsed. Check its format and try again." }, { status: 400 });
  }
}

function isPdf(bytes: Uint8Array, mimeType: string) {
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  return signature === "%PDF-" && (!mimeType || mimeType === "application/pdf");
}

function isSafeCsv(bytes: Uint8Array, mimeType: string) {
  const allowedTypes = new Set(["", "text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"]);
  return allowedTypes.has(mimeType) && !bytes.slice(0, 8_192).includes(0);
}

function sanitizeFileName(fileName: string) {
  const baseName = fileName.replaceAll("\\", "/").split("/").pop() ?? "import";
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "import";
}

function isValidQuestion(question: ImportPreviewQuestion) {
  return question.question.length >= 5
    && question.question.length <= 10_000
    && question.topic.length <= 120
    && question.subtopic.length <= 120
    && question.explanation.length <= 10_000
    && question.sourceReference.length <= 300
    && question.answer.length <= 80
    && question.options.length >= 2
    && question.options.length <= 10
    && question.options.every((option) => option.length >= 1 && option.length <= 2_000);
}
