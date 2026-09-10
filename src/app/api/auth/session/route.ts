import { getAdminUser } from "@/lib/admin-auth";
import { noStoreJson } from "@/lib/security";

export async function GET() {
  const user = await getAdminUser();
  return noStoreJson({ authenticated: Boolean(user), user });
}
