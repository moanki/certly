import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const participantCookie = "certly_participant";
const participantPattern = /^[a-f0-9]{32}$/;

export async function getOrCreateParticipantId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(participantCookie)?.value;
  if (existing && participantPattern.test(existing)) return existing;

  const participantId = randomUUID().replaceAll("-", "");
  cookieStore.set({
    name: participantCookie,
    value: participantId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    priority: "high",
  });
  return participantId;
}
