import { Client, Storage, TablesDB } from "node-appwrite";

const config = {
  endpoint: process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1",
  projectId: process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1",
  apiKey: process.env.APPWRITE_ADMIN_API_KEY ?? process.env.APPWRITE_API_KEY,
  databaseId: process.env.APPWRITE_DATABASE_ID ?? "certly",
  importsBucketId: process.env.APPWRITE_IMPORTS_BUCKET_ID ?? "imports",
};

if (!config.apiKey) throw new Error("APPWRITE_ADMIN_API_KEY is required.");

const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
const tables = new TablesDB(client);
const storage = new Storage(client);

const collections = [
  {
    id: "questions",
    name: "Questions",
    attributes: [
      string("certificationId", 36, true),
      string("topic", 120, true),
      string("status", 20, true),
      string("payloadJson", 15000, true),
    ],
    indexes: [key("certification_topic", ["certificationId", "topic"]), key("status", ["status"])],
  },
  {
    id: "records",
    name: "Attempts and imports",
    attributes: [
      string("kind", 20, true),
      string("lookup", 254, true),
      string("status", 20, true),
      datetime("occurredAt", true),
      string("payloadJson", 15000, true),
    ],
    indexes: [
      key("record_history", ["kind", "lookup", "occurredAt"]),
      key("occurred_at", ["kind", "occurredAt"]),
      key("import_status", ["kind", "status"]),
    ],
  },
];

await ensureDatabase();
for (const collection of collections) await ensureTable(collection);
await ensureBucket();
console.log("Appwrite schema is ready.");

async function ensureDatabase() {
  try {
    await tables.get({ databaseId: config.databaseId });
    console.log(`Database exists: ${config.databaseId}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await tables.create({ databaseId: config.databaseId, name: "Certly" });
    console.log(`Created database: ${config.databaseId}`);
  }
}

async function ensureTable(collection) {
  let existing;
  try {
    existing = await tables.getTable({ databaseId: config.databaseId, tableId: collection.id });
    if (existing.$permissions.length || existing.rowSecurity || !existing.enabled) {
      await tables.updateTable({
        databaseId: config.databaseId,
        tableId: collection.id,
        name: collection.name,
        permissions: [],
        rowSecurity: false,
        enabled: true,
      });
      console.log(`Hardened table access: ${collection.id}`);
    } else {
      console.log(`Table is private: ${collection.id}`);
    }
  } catch (error) {
    if (error?.code !== 404) throw error;
    existing = await tables.createTable({
      databaseId: config.databaseId,
      tableId: collection.id,
      name: collection.name,
      permissions: [],
      rowSecurity: false,
      enabled: true,
    });
    console.log(`Created private table: ${collection.id}`);
  }

  await ensureColumns(collection, existing);
  await ensureIndexes(collection);
}

async function ensureColumns(table, existing) {
  const known = new Set((existing.columns ?? []).map((column) => column.key));
  for (const column of table.attributes) {
    if (known.has(column.key)) continue;
    const base = {
      databaseId: config.databaseId,
      tableId: table.id,
      key: column.key,
      required: column.required,
      array: column.array ?? false,
    };
    if (column.type === "string") {
      await tables.createStringColumn({ ...base, size: column.size, encrypt: false });
    } else if (column.type === "integer") {
      await tables.createIntegerColumn(base);
    } else if (column.type === "boolean") {
      await tables.createBooleanColumn(base);
    } else if (column.type === "datetime") {
      await tables.createDatetimeColumn(base);
    } else {
      throw new Error(`Unsupported column type: ${column.type}`);
    }
    await waitForSchema(table.id, "columns", column.key);
    console.log(`Created column: ${table.id}.${column.key}`);
  }
}

async function ensureIndexes(table) {
  let current = await tables.getTable({ databaseId: config.databaseId, tableId: table.id });
  const known = new Set((current.indexes ?? []).map((index) => index.key));
  for (const index of table.indexes) {
    if (known.has(index.key)) continue;
    await tables.createIndex({
      databaseId: config.databaseId,
      tableId: table.id,
      key: index.key,
      type: index.type,
      columns: index.attributes,
    });
    await waitForSchema(table.id, "indexes", index.key);
    console.log(`Created index: ${table.id}.${index.key}`);
    current = await tables.getTable({ databaseId: config.databaseId, tableId: table.id });
  }
}

async function waitForSchema(tableId, property, keyName) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const table = await tables.getTable({ databaseId: config.databaseId, tableId });
    const item = (table[property] ?? []).find((candidate) => candidate.key === keyName);
    if (item?.status === "available") return;
    if (item?.status === "failed") throw new Error(`Appwrite failed to create ${tableId}.${keyName}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out creating ${tableId}.${keyName}`);
}

async function ensureBucket() {
  try {
    const bucket = await storage.getBucket({ bucketId: config.importsBucketId });
    const extensionsAreSafe = bucket.allowedFileExtensions.length === 2
      && bucket.allowedFileExtensions.includes("pdf")
      && bucket.allowedFileExtensions.includes("csv");
    if (bucket.$permissions.length || bucket.fileSecurity || !bucket.enabled || bucket.maximumFileSize !== 10 * 1024 * 1024 || !extensionsAreSafe || !bucket.encryption || !bucket.antivirus) {
      await storage.updateBucket({
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
        transformations: false,
      });
      console.log(`Hardened private bucket: ${config.importsBucketId}`);
    } else {
      console.log(`Bucket is private and hardened: ${config.importsBucketId}`);
    }
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
function datetime(keyName, required) { return { key: keyName, type: "datetime", required }; }
function key(keyName, attributes) { return { key: keyName, type: "key", attributes }; }
