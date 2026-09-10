import { Account, Client, Databases, Storage } from "node-appwrite";

export const appwriteConfig = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1",
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "certly",
  certificationsCollectionId: process.env.APPWRITE_CERTIFICATIONS_COLLECTION_ID ?? "certifications",
  presetsCollectionId: process.env.APPWRITE_PRESETS_COLLECTION_ID ?? "exam_presets",
  questionsCollectionId: process.env.APPWRITE_QUESTIONS_COLLECTION_ID ?? "questions",
  attemptsCollectionId: process.env.APPWRITE_ATTEMPTS_COLLECTION_ID ?? "attempts",
  answersCollectionId: process.env.APPWRITE_ATTEMPT_ANSWERS_COLLECTION_ID ?? "attempt_answers",
  importsCollectionId: process.env.APPWRITE_IMPORTS_COLLECTION_ID ?? "imports",
  importsBucketId: process.env.APPWRITE_IMPORTS_BUCKET_ID ?? "imports",
};

export function createAdminClient() {
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!apiKey) {
    throw new Error("APPWRITE_API_KEY is required for server-side Appwrite access.");
  }

  const client = new Client()
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId)
    .setKey(apiKey);

  return {
    client,
    account: new Account(client),
    databases: new Databases(client),
    storage: new Storage(client),
  };
}

export function createSessionClient(session: string) {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId)
    .setSession(session);

  return {
    client,
    account: new Account(client),
  };
}
