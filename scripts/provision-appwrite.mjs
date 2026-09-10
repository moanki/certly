import { Client, Databases, Storage } from "node-appwrite";

const config = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1",
  apiKey: process.env.APPWRITE_API_KEY,
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "certly",
  importsBucketId: process.env.APPWRITE_IMPORTS_BUCKET_ID ?? "imports",
};

if (!config.apiKey) throw new Error("APPWRITE_API_KEY is required.");

const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
const databases = new Databases(client);
const storage = new Storage(client);

const collections = [
  {
    id: "certifications",
    name: "Certifications",
    attributes: [
      string("name", 180, true), string("code", 40, true), string("vendor", 80, true), bool("active", true),
    ],
    indexes: [unique("code_unique", ["code"])],
  },
  {
    id: "exam_presets",
    name: "Exam presets",
    attributes: [
      string("certificationId", 36, true), string("title", 180, true), integer("questionCount", true),
      integer("durationMinutes", true), integer("scoreScale", true), integer("passingScore", true),
      bool("exactMultipleAnswerScoring", true), bool("negativeMarkingEnabled", true),
    ],
    indexes: [key("certification", ["certificationId"])],
  },
  {
    id: "questions",
    name: "Questions",
    attributes: [
      string("certificationId", 36, true), string("examVersion", 80, true), string("topic", 120, true),
      string("subtopic", 120, true), string("difficulty", 20, true), string("type", 20, true),
      string("text", 10000, true), string("optionsJson", 30000, true), string("explanation", 10000, false),
      string("sourceType", 40, true), string("sourceReference", 300, false), string("status", 20, true),
    ],
    indexes: [key("certification_topic", ["certificationId", "topic"]), key("status", ["status"])],
  },
  {
    id: "attempts",
    name: "Attempts",
    attributes: [
      string("candidateName", 128, true), string("candidateEmail", 254, false), string("certificationId", 36, true),
      string("mode", 20, true), bool("timed", true), datetime("startedAt", true), datetime("submittedAt", true),
      integer("score", true), bool("passed", true), integer("correct", true), integer("incorrect", true),
      integer("unanswered", true), integer("total", true), integer("durationSeconds", true),
    ],
    indexes: [key("candidate_history", ["candidateEmail", "submittedAt"]), key("submitted_at", ["submittedAt"])],
  },
  {
    id: "attempt_answers",
    name: "Attempt answers",
    attributes: [
      string("attemptId", 36, true), string("questionId", 36, true), arrayString("selectedOptionIds", 36, true),
      integer("timeSpentSeconds", true), bool("markedForReview", true), bool("isCorrect", true),
    ],
    indexes: [key("attempt", ["attemptId"]), key("question", ["questionId"])],
  },
  {
    id: "imports",
    name: "Imports",
    attributes: [
      string("fileId", 36, true), string("fileName", 255, true), string("status", 20, true),
      integer("detectedCount", true), string("uploadedBy", 254, true),
    ],
    indexes: [key("import_status", ["status"])],
  },
];

await ensureDatabase();
for (const collection of collections) await ensureCollection(collection);
await ensureBucket();
console.log("Appwrite schema is ready.");

async function ensureDatabase() {
  try {
    await databases.get({ databaseId: config.databaseId });
    console.log(`Database exists: ${config.databaseId}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await databases.create({ databaseId: config.databaseId, name: "Certly" });
    console.log(`Created database: ${config.databaseId}`);
  }
}

async function ensureCollection(collection) {
  try {
    await databases.getCollection({ databaseId: config.databaseId, collectionId: collection.id });
    console.log(`Collection exists: ${collection.id}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await databases.createCollection({
      databaseId: config.databaseId,
      collectionId: collection.id,
      name: collection.name,
      permissions: [],
      documentSecurity: false,
      enabled: true,
      attributes: collection.attributes,
      indexes: collection.indexes,
    });
    console.log(`Created collection: ${collection.id}`);
  }
}

async function ensureBucket() {
  try {
    await storage.getBucket({ bucketId: config.importsBucketId });
    console.log(`Bucket exists: ${config.importsBucketId}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await storage.createBucket({
      bucketId: config.importsBucketId,
      name: "Question imports",
      permissions: [],
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 10 * 1024 * 1024,
      allowedFileExtensions: ["pdf", "csv"],
      compression: "none",
      encryption: true,
      antivirus: true,
    });
    console.log(`Created bucket: ${config.importsBucketId}`);
  }
}

function string(keyName, size, required) { return { key: keyName, type: "string", size, required }; }
function arrayString(keyName, size, required) { return { key: keyName, type: "string", size, required, array: true }; }
function integer(keyName, required) { return { key: keyName, type: "integer", required }; }
function bool(keyName, required) { return { key: keyName, type: "boolean", required }; }
function datetime(keyName, required) { return { key: keyName, type: "datetime", required }; }
function key(keyName, attributes) { return { key: keyName, type: "key", attributes }; }
function unique(keyName, attributes) { return { key: keyName, type: "unique", attributes }; }
