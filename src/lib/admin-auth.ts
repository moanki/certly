import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/appwrite";

export const adminSessionCookie = process.env.NODE_ENV === "production"
  ? "__Host-certly_admin_session"
  : "certly_admin_session";

export async function getAdminUser() {
  const session = (await cookies()).get(adminSessionCookie)?.value;
  if (!session) return null;

  try {
    const { account } = createSessionClient(session);
    const user = await account.get();
    if (!user.labels.includes("admin")) return null;
    return { id: user.$id, name: user.name, email: user.email };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("ADMIN_UNAUTHORIZED");
  return user;
}
