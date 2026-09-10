import { cookies } from "next/headers";
import { adminSessionCookie } from "@/lib/admin-auth";
import { createAdminClient, createSessionClient } from "@/lib/appwrite";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim();
    const password = body.password ?? "";
    if (!email || password.length < 8) {
      return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
    }

    const { account } = createAdminClient();
    const session = await account.createEmailPasswordSession({ email, password });
    const sessionClient = createSessionClient(session.secret);
    const user = await sessionClient.account.get();

    if (!user.labels.includes("admin")) {
      await sessionClient.account.deleteSession({ sessionId: "current" });
      return Response.json({ error: "This account does not have admin access." }, { status: 403 });
    }

    (await cookies()).set(adminSessionCookie, session.secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expire),
    });

    return Response.json({ user: { id: user.$id, name: user.name, email: user.email } });
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
}
