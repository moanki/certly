import { cookies } from "next/headers";
import { adminSessionCookie } from "@/lib/admin-auth";
import { createSessionClient } from "@/lib/appwrite";
import { enforceSameOrigin, noStoreJson } from "@/lib/security";

export async function DELETE(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  const cookieStore = await cookies();
  const session = cookieStore.get(adminSessionCookie)?.value;
  if (session) {
    try {
      await createSessionClient(session).account.deleteSession({ sessionId: "current" });
    } catch {
      // The local cookie still needs to be cleared if Appwrite already expired it.
    }
  }
  cookieStore.set(adminSessionCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return noStoreJson({ ok: true });
}
