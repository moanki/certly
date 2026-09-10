import { describe, expect, it } from "vitest";
import { enforceBodyLimit, enforceRateLimit, enforceSameOrigin } from "@/lib/security";

describe("request security controls", () => {
  it("rejects cross-site state-changing requests", async () => {
    const request = new Request("https://certly.example/api/attempts", {
      method: "POST",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    });

    const response = enforceSameOrigin(request);
    expect(response?.status).toBe(403);
  });

  it("rejects declared request bodies above the endpoint limit", () => {
    const request = new Request("https://certly.example/api/import", {
      method: "POST",
      headers: { "content-length": "9000" },
    });

    expect(enforceBodyLimit(request, 8_192)?.status).toBe(413);
  });

  it("limits repeated requests for the same scope and client", () => {
    const request = new Request("https://certly.example/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const scope = `test-${Date.now()}`;

    expect(enforceRateLimit(request, scope, 1, 60_000)).toBeNull();
    expect(enforceRateLimit(request, scope, 1, 60_000)?.status).toBe(429);
  });
});
