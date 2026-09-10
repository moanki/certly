import { Client, ID, Query, Users } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_PROJECT_ID ?? "6aa2933f0011fcc722a1";
const apiKey = process.env.APPWRITE_ADMIN_API_KEY ?? process.env.APPWRITE_API_KEY;
const email = process.env.CERTLY_ADMIN_EMAIL;
const password = process.env.CERTLY_ADMIN_PASSWORD;
const name = process.env.CERTLY_ADMIN_NAME ?? "Certly Admin";

if (!apiKey || !email || !password) {
  throw new Error("APPWRITE_ADMIN_API_KEY, CERTLY_ADMIN_EMAIL and CERTLY_ADMIN_PASSWORD are required.");
}

const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
const existing = await users.list({ queries: [Query.equal("email", [email])] });
const user = existing.users[0] ?? await users.create({ userId: ID.unique(), email, password, name });
await users.updateLabels({ userId: user.$id, labels: [...new Set([...user.labels, "admin"])] });
console.log(`Admin is ready: ${email}`);
