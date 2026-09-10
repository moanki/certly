import { createHash } from "node:crypto";

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

export function enforceSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Request origin is required." }, { status: 403 });
  }

  return null;
}

export function enforceBodyLimit(request: Request, maximumBytes: number) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return null;
  const length = Number(rawLength);
  if (!Number.isFinite(length) || length < 0 || length > maximumBytes) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }
  return null;
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = "",
) {
  const now = Date.now();
  if (rateLimitStore.size > 2_000) {
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(key);
    }
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const identity = createHash("sha256").update(`${address}:${discriminator}`).digest("hex").slice(0, 24);
  const key = `${scope}:${identity}`;
  const current = rateLimitStore.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  rateLimitStore.set(key, entry);

  if (entry.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  return Response.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return Response.json(data, { ...init, headers });
}

export function securityLog(event: string, details: Record<string, string | number | boolean> = {}) {
  console.warn(JSON.stringify({ type: "security", event, ...details, timestamp: new Date().toISOString() }));
}
