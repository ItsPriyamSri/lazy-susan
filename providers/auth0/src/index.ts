import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

/**
 * The API serves a folder that contains a passport scan and a bank statement.
 * That should not be readable by whoever happens to reach the port.
 *
 * Auth0 issues the token; this file only checks it. Nothing here trusts the
 * client for anything except the token itself: signature against the tenant's
 * JWKS, issuer, audience and expiry, in that order.
 */

export interface AuthConfig {
  /** Tenant domain, without the scheme. */
  domain: string;
  audience: string;
  /** Overridden in tests so no network is needed. */
  jwksUri?: string;
  issuer?: string;
}

export function authConfig(): AuthConfig | null {
  const domain = process.env.AUTH0_DOMAIN?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const audience = process.env.AUTH0_AUDIENCE?.trim();
  if (!domain || !audience) return null;
  return { domain, audience };
}

export function isEnabled(): boolean {
  return authConfig() !== null;
}

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(config: AuthConfig): ReturnType<typeof createRemoteJWKSet> {
  const uri = config.jwksUri ?? `https://${config.domain}/.well-known/jwks.json`;
  let set = jwks.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwks.set(uri, set);
  }
  return set;
}

export class NotSignedIn extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NotSignedIn";
  }
}

/** Verifies a bearer token. Throws NotSignedIn with a reason worth reading. */
export async function verifyToken(token: string, config = authConfig()): Promise<JWTPayload> {
  if (!config) throw new NotSignedIn("auth is not configured");
  if (!token) throw new NotSignedIn("no token");

  try {
    const { payload } = await jwtVerify(token, keySetFor(config), {
      issuer: config.issuer ?? `https://${config.domain}/`,
      audience: config.audience,
      clockTolerance: 5,
    });
    if (!payload.sub) throw new NotSignedIn("token has no subject");
    return payload;
  } catch (err) {
    if (err instanceof NotSignedIn) throw err;
    throw new NotSignedIn((err as Error).message);
  }
}

/** Reads the header the way a browser sends it, with no attempt to be clever. */
export function bearerFrom(header: string | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? "";
}
