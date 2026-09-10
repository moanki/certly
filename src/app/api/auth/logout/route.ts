import { cookies } from "next/headers";
import { adminSessionCookie } from "@/lib/admin-auth";
import { createSessionClient } from "@/lib/appwrite";

export async function DELETE() {
  const cookieStore = await cookies();
  const session = cookieStore.get(adminSessionCookie)?.value;
  if (session) {
    try {
      await createSessionClient(session).account.deleteSession({ sessionId: "current" });
    } catch {
      // The local cookie still needs to be cleared if Appwrite already expired it.
    }
  }
  cookieStore.delete(adminSessionCookie);
  return Response.json({ ok: true });
}
