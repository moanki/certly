import { Account, Client, Storage, TablesDB } from "node-appwrite";

export const appwriteConfig = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1",
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "certly",
  questionsCollectionId: process.env.APPWRITE_QUESTIONS_COLLECTION_ID ?? "questions",
  attemptsCollectionId: process.env.APPWRITE_RECORDS_TABLE_ID ?? "records",
  importsCollectionId: process.env.APPWRITE_RECORDS_TABLE_ID ?? "records",
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
    tables: new TablesDB(client),
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
