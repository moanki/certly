import { cookies } from "next/headers";
import { adminSessionCookie } from "@/lib/admin-auth";
import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin, noStoreJson, securityLog } from "@/lib/security";

export async function POST(request: Request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const sizeError = enforceBodyLimit(request, 8 * 1024);
  if (sizeError) return sizeError;

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || email.length > 254 || password.length < 8 || password.length > 256) {
      return noStoreJson({ error: "Enter a valid email and password." }, { status: 400 });
    }

    const rateLimitError = enforceRateLimit(request, "admin-login", 5, 15 * 60 * 1_000, email);
    if (rateLimitError) {
      securityLog("admin_login_rate_limited");
      return rateLimitError;
    }

    const { account } = createAdminClient();
    const session = await account.createEmailPasswordSession({ email, password });
    const sessionClient = createSessionClient(session.secret);
    const user = await sessionClient.account.get();

    if (!user.labels.includes("admin")) {
      await sessionClient.account.deleteSession({ sessionId: "current" });
      securityLog("admin_login_rejected", { reason: "missing_role" });
      return noStoreJson({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const appwriteExpiry = new Date(session.expire).getTime();
    const expiry = new Date(Math.min(appwriteExpiry, Date.now() + 8 * 60 * 60 * 1_000));
    (await cookies()).set(adminSessionCookie, session.secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: expiry,
    });

    securityLog("admin_login_succeeded", { userId: user.$id });
    return noStoreJson({ user: { id: user.$id, name: user.name, email: user.email } });
  } catch {
    securityLog("admin_login_failed");
    return noStoreJson({ error: "Email or password is incorrect." }, { status: 401 });
  }
}
