import { getAdminUser } from "@/lib/admin-auth";

export async function GET() {
  const user = await getAdminUser();
  return Response.json({ authenticated: Boolean(user), user });
}
