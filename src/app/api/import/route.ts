import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { requireAdmin } from "@/lib/admin-auth";
import { appwriteConfig, createAdminClient } from "@/lib/appwrite";
import { extractLooseQuestionsFromText, parseCsvImport } from "@/lib/importers";

export const runtime = "nodejs";

const maxFileSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a PDF or CSV file." }, { status: 400 });
    }
    if (file.size > maxFileSize) {
      return Response.json({ error: "The file must be 10 MB or smaller." }, { status: 413 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "csv") {
      return Response.json({ error: "Only PDF and CSV files are supported in this release." }, { status: 415 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let questions;
    if (extension === "csv") {
      questions = parseCsvImport(new TextDecoder().decode(bytes));
    } else {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      try {
        const parsed = await parser.getText();
        questions = extractLooseQuestionsFromText(parsed.text);
      } finally {
        await parser.destroy();
      }
    }

    const { databases, storage } = createAdminClient();
    const storedFile = await storage.createFile({
      bucketId: appwriteConfig.importsBucketId,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(bytes, file.name),
    });
    const importRecord = await databases.createDocument({
      databaseId: appwriteConfig.databaseId,
      collectionId: appwriteConfig.importsCollectionId,
      documentId: ID.unique(),
      data: {
        fileId: storedFile.$id,
        fileName: file.name,
        status: "preview",
        detectedCount: questions.length,
        uploadedBy: admin.email,
      },
    });

    return Response.json({ importId: importRecord.$id, questions });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") {
      return Response.json({ error: "Admin sign-in is required." }, { status: 401 });
    }
    return Response.json({ error: "The file could not be parsed. Check its format and try again." }, { status: 500 });
  }
}
