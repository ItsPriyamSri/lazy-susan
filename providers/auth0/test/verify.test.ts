import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotSignedIn, bearerFrom, isEnabled, verifyToken } from "../src/index.js";

/**
 * A real OIDC check needs a real key pair and a real JWKS document. Both are
 * generated here, so the verification code runs exactly as it would against a
 * tenant, and the test needs no account.
 */
describe("auth0 token verification", () => {
  let server: ReturnType<typeof createServer>;
  let jwksUri = "";
  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;
  const audience = "https://lazy-susan.local/api";
  const issuer = "https://tenant.example/";

  const config = () => ({ domain: "tenant.example", audience, issuer, jwksUri });

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    publicJwk = { ...jwk, kid: "test-key", alg: "RS256", use: "sig" };

    server = createServer((req, res) => {
      if (req.url === "/jwks.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    jwksUri = `http://127.0.0.1:${port}/jwks.json`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function sign(overrides: { audience?: string; issuer?: string; expiresIn?: string; sub?: string | null } = {}) {
    const jwt = new SignJWT({ scope: "openid profile" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setIssuedAt();

    if (overrides.sub !== null) jwt.setSubject(overrides.sub ?? "auth0|priyam");
    return jwt.setExpirationTime(overrides.expiresIn ?? "5m").sign(privateKey);
  }

  it("is off when nothing is configured, so a local run is not locked out", () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_AUDIENCE;
    expect(isEnabled()).toBe(false);
  });

  it("is on as soon as a domain and audience exist", () => {
    process.env.AUTH0_DOMAIN = "https://tenant.example/";
    process.env.AUTH0_AUDIENCE = audience;
    expect(isEnabled()).toBe(true);
    expect(isEnabled()).toBe(true);
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_AUDIENCE;
  });

  it("accepts a token the tenant signed", async () => {
    const payload = await verifyToken(await sign(), config());
    expect(payload.sub).toBe("auth0|priyam");
  });

  it("rejects a token for a different audience", async () => {
    await expect(verifyToken(await sign({ audience: "https://someone.else" }), config())).rejects.toBeInstanceOf(
      NotSignedIn,
    );
  });

  it("rejects a token from a different issuer", async () => {
    await expect(verifyToken(await sign({ issuer: "https://evil.example/" }), config())).rejects.toThrow(
      NotSignedIn,
    );
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("auth0|priyam")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .sign(privateKey);
    await expect(verifyToken(expired, config())).rejects.toThrow(/exp|JWT/i);
  });

  it("rejects a token signed with a key that is not the tenant's", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("auth0|someone")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(verifyToken(forged, config())).rejects.toBeInstanceOf(NotSignedIn);
  });

  it("rejects a token with no subject, because there is nobody to attribute it to", async () => {
    await expect(verifyToken(await sign({ sub: null }), config())).rejects.toThrow(/subject/);
  });

  it("reads a bearer header and ignores anything that is not one", () => {
    expect(bearerFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerFrom("bearer   xyz")).toBe("xyz");
    expect(bearerFrom("Basic abc")).toBe("");
    expect(bearerFrom(undefined)).toBe("");
  });
});
