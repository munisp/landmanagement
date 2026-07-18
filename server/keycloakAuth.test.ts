/**
 * Tests for the Keycloak auth hardening module: signed OAuth state,
 * role extraction and mapping, and bearer-token verification behavior.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSignedState,
  extractKeycloakRoles,
  mapKeycloakRolesToAppRole,
  resetKeycloakAuthCacheForTests,
  verifyKeycloakBearerToken,
  verifySignedState,
} from './_core/keycloakAuth';

const TEST_SECRET = 'test-secret-key-with-32-plus-characters';

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  resetKeycloakAuthCacheForTests();
});

describe('signed OAuth state', () => {
  it('round-trips a valid state payload', () => {
    const state = createSignedState({ redirectTo: '/dashboard', nonce: 'abc123', issuedAt: Date.now() });
    const payload = verifySignedState(state);
    expect(payload).not.toBeNull();
    expect(payload?.redirectTo).toBe('/dashboard');
    expect(payload?.nonce).toBe('abc123');
  });

  it('rejects a tampered payload', () => {
    const state = createSignedState({ redirectTo: '/dashboard', nonce: 'abc123', issuedAt: Date.now() });
    const [body, signature] = state.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ redirectTo: 'https://evil.example', nonce: 'abc123', issuedAt: Date.now() })).toString('base64url');
    expect(verifySignedState(`${forgedBody}.${signature}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const state = createSignedState({ redirectTo: '/dashboard', nonce: 'abc123', issuedAt: Date.now() });
    const [body] = state.split('.');
    expect(verifySignedState(`${body}.invalidsignature`)).toBeNull();
  });

  it('rejects an expired state', () => {
    const stale = createSignedState({ redirectTo: '/dashboard', nonce: 'abc123', issuedAt: Date.now() - 11 * 60 * 1000 });
    expect(verifySignedState(stale)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifySignedState('not-a-state')).toBeNull();
    expect(verifySignedState('')).toBeNull();
    expect(verifySignedState('a.b.c')).toBeNull();
  });

  it('produces unique states per call (random nonces supported)', () => {
    const a = createSignedState({ redirectTo: '/x', nonce: 'n1', issuedAt: Date.now() });
    const b = createSignedState({ redirectTo: '/x', nonce: 'n2', issuedAt: Date.now() });
    expect(a).not.toBe(b);
  });
});

describe('realm role extraction and mapping', () => {
  it('extracts roles from realm_access claim', () => {
    expect(extractKeycloakRoles({ realm_access: { roles: ['idlr-admin', 'offline_access'] } })).toEqual(['idlr-admin', 'offline_access']);
  });

  it('returns empty array when no realm roles exist', () => {
    expect(extractKeycloakRoles({})).toEqual([]);
    expect(extractKeycloakRoles({ realm_access: {} })).toEqual([]);
    expect(extractKeycloakRoles({ realm_access: { roles: 'not-an-array' } })).toEqual([]);
  });

  it('maps idlr-admin to admin', () => {
    expect(mapKeycloakRolesToAppRole(['idlr-admin'])).toBe('admin');
  });

  it('maps registrar roles to registrar', () => {
    expect(mapKeycloakRolesToAppRole(['idlr-registrar'])).toBe('registrar');
    expect(mapKeycloakRolesToAppRole(['registrar'])).toBe('registrar');
  });

  it('highest privilege wins when multiple roles exist', () => {
    expect(mapKeycloakRolesToAppRole(['idlr-surveyor', 'idlr-admin'])).toBe('admin');
  });

  it('defaults to user for unprivileged or empty roles', () => {
    expect(mapKeycloakRolesToAppRole([])).toBe('user');
    expect(mapKeycloakRolesToAppRole(['offline_access', 'uma_authorization'])).toBe('user');
  });
});

describe('bearer token verification', () => {
  it('returns null when Keycloak is not configured', async () => {
    delete process.env.KEYCLOAK_URL;
    resetKeycloakAuthCacheForTests();
    expect(await verifyKeycloakBearerToken('any.token.here')).toBeNull();
  });

  it('rejects malformed tokens without contacting the JWKS endpoint', async () => {
    process.env.KEYCLOAK_URL = 'https://keycloak.example.invalid';
    resetKeycloakAuthCacheForTests();
    expect(await verifyKeycloakBearerToken('not-a-jwt')).toBeNull();
  });
});
