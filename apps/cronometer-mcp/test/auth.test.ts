import { describe, expect, it } from "vitest";
import { authorizationSecurityHeaders, grantScopes, isAllowedAuthorizationOrigin } from "../src/auth";
import { authPropsSchema } from "@cronometer-mcp/core";

describe("isAllowedAuthorizationOrigin", () => {
  it("allows same-origin and OAuth opaque-origin form submissions", () => {
    expect(isAllowedAuthorizationOrigin(new Request("https://mcp.example.com/authorize"))).toBe(true);
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", {
          headers: { Origin: "https://mcp.example.com" },
        }),
      ),
    ).toBe(true);
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", { headers: { Origin: "null" } }),
      ),
    ).toBe(true);
  });

  it("rejects a different web origin", () => {
    expect(
      isAllowedAuthorizationOrigin(
        new Request("https://mcp.example.com/authorize", {
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });
});

describe("authorizationSecurityHeaders", () => {
  it("allows the validated OAuth callback origin across a form redirect", () => {
    expect(
      authorizationSecurityHeaders("https://chatgpt.com/connector/oauth/callback").get(
        "Content-Security-Policy",
      ),
    ).toContain("form-action 'self' https://chatgpt.com;");
  });

  it("keeps error pages restricted to same-origin form targets", () => {
    expect(authorizationSecurityHeaders().get("Content-Security-Policy")).toContain(
      "form-action 'self';",
    );
  });
});

describe("Cronometer OAuth scope consent", () => {
  it("grants write only when it was requested and explicitly checked", () => {
    expect(grantScopes(["cronometer:read", "cronometer:write"], false)).toEqual([
      "cronometer:read",
    ]);
    expect(grantScopes(["cronometer:read", "cronometer:write"], true)).toEqual([
      "cronometer:read",
      "cronometer:write",
    ]);
  });

  it("does not grant scopes the client did not request", () => {
    expect(grantScopes(["cronometer:read"], true)).toEqual(["cronometer:read"]);
    expect(grantScopes(["unknown:scope", "cronometer:write"], true)).toEqual([]);
  });

  it("treats older grants without a write-consent field as read-only", () => {
    const parsed = authPropsSchema.parse({
      cronometerMobileSession: { sessionKey: "session", userId: 1 },
      cronometerUsername: "user@example.com",
      cronometerWebSession: { cookies: "session", userId: "1" },
    });
    expect(parsed.cronometerWriteConsent).toBe(false);
    expect(parsed.cronometerAccessScopes).toEqual([]);
  });
});
