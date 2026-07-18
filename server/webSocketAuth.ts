import type { IncomingMessage } from "http";
import type { User } from "../drizzle/schema";
import { sdk } from "./_core/sdk";

/**
 * Authenticate a WebSocket upgrade request through the same session pipeline
 * used for HTTP requests: the signed session cookie, or a Keycloak RS256
 * bearer token in the Authorization header.
 *
 * Every WebSocket service MUST resolve the connecting user this way and
 * derive the user identity from the returned session — never from
 * client-supplied query parameters or message payloads, which are trivially
 * spoofable by any external or internal actor.
 *
 * Returns the authenticated user, or null when the request carries no valid
 * credentials (the caller should close the socket with code 1008).
 */
export async function authenticateWebSocketUpgrade(
  req: IncomingMessage
): Promise<User | null> {
  try {
    // sdk.authenticateRequest only reads req.headers (cookie / authorization),
    // which the upgrade request provides; the cast is structural, not logical.
    const user = await sdk.authenticateRequest(
      req as unknown as Parameters<typeof sdk.authenticateRequest>[0]
    );
    return user ?? null;
  } catch {
    return null;
  }
}
