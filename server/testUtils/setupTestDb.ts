/**
 * Vitest setup: give every test worker a real embedded PostgreSQL database
 * with the full production migration set applied. The values below are test
 * fixtures only; production configuration remains mandatory and secret-backed.
 */
process.env.NODE_ENV = "test";
process.env.CACHE_ENABLED = "false";
process.env.MICROSERVICES_ENABLED = "false";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CASE_CONCIERGE_SESSION_TTL_SECONDS ??= "7200";
process.env.FRONTEND_URL ??= "http://localhost:3000";
process.env.ALLOWED_ORIGINS ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.POLYGON_RPC_URL ??= "http://127.0.0.1:18545";
process.env.POLYGON_CHAIN_ID ??= "80001";
process.env.ESCROW_CONTRACT_ADDRESS ??= "0x1111111111111111111111111111111111111111";
process.env.DEPLOYER_PRIVATE_KEY ??= "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.LAKEHOUSE_API_URL ??= "http://127.0.0.1:18000";
process.env.LAKEHOUSE_API_KEY ??= "test-lakehouse-service-key";
process.env.KEYCLOAK_URL ??= "http://127.0.0.1:18080";
process.env.KEYCLOAK_REALM ??= "idlr-pts-test";
process.env.KEYCLOAK_CLIENT_ID ??= "idlr-pts-test-client";
process.env.KEYCLOAK_CLIENT_SECRET ??= "test-keycloak-client-secret";
process.env.KEYCLOAK_ADMIN_REALM ??= "master";
process.env.KEYCLOAK_ADMIN_CLIENT_ID ??= "idlr-pts-test-admin-client";
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= "test-keycloak-admin-secret";
process.env.PERMIFY_URL ??= "http://127.0.0.1:13476";
process.env.PERMIFY_TENANT_ID ??= "idlr-test";
process.env.ELASTICSEARCH_URL ??= "http://127.0.0.1:19200";
process.env.ELASTICSEARCH_USERNAME ??= "idlr-test";
process.env.ELASTICSEARCH_PASSWORD ??= "idlr-test";

import { beforeAll } from "vitest";
import { ensureTestDb } from "./testDb";

beforeAll(async () => {
  await ensureTestDb();
}, 120_000);
