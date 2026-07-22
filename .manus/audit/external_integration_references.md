# External Integration References

## TigerBeetle

The official Rust client reference confirms that a client is constructed with a cluster ID and replica address, that transfers are persisted through `create_transfers`, and that account/transfer IDs act as idempotency keys. The reliable-submission guidance specifically requires retaining and reusing the transfer ID across retries so the ledger records a transfer exactly once.

- TigerBeetle Rust client: <https://docs.tigerbeetle.com/coding/clients/rust/>
- TigerBeetle reliable transaction submission: <https://docs.tigerbeetle.com/coding/reliable-transaction-submission/>

## APISIX

APISIX supports configuration-file environment variable substitution using `${{VARIABLE}}`; without a defined value it fails rather than silently accepting a hard-coded credential. The Admin API guidance also recommends replacing defaults and limiting `deployment.admin.allow_admin` to trusted addresses. These references support removing static Admin API keys and exposing the admin listener only on the internal network.

- APISIX configuration based on environments: <https://apisix.apache.org/docs/apisix/profile/>
- APISIX Admin API: <https://apisix.apache.org/docs/apisix/admin-api/>

## Permify

Permify stores an authorization model through `POST /v1/tenants/{tenant_id}/schemas/write`, returning a schema version. Relationship tuples are written through `POST /v1/tenants/{tenant_id}/data/write`, with tenant ID, schema-version metadata, entity, relation, and subject. The platform should therefore version the local model and publish it before onboarding writes tuples.

- Permify API interaction overview: <https://docs.permify.co/getting-started/enforcement>
- Permify schema write API: <https://docs.permify.co/api-reference/schema/write-schema>
- Permify authorization-data write API: <https://docs.permify.co/api-reference/data/write-data>

## Keycloak

The current Keycloak Admin REST API index documents user administration and realm-role mapping endpoints. It is the source for implementing server-side user provisioning and role assignment using a service-account token instead of fabricated identity identifiers.

- Keycloak Admin REST API: <https://www.keycloak.org/docs-api/latest/rest-api/index.html>

## OpenAppSec

The official documentation identifies agent and management setup as separate deployment concerns. The platform needs an actual traffic-protection integration, not merely a health probe.

- OpenAppSec documentation: <https://docs.openappsec.io/>

## Fluvio

The supported Node client is the native `@fluvio/client` package. It creates a cluster connection with explicit host/port options, then creates a topic-specific producer and sends key/value records. This validates using the client API in the event outbox instead of an assumed HTTP endpoint.

- Fluvio Node client examples: <https://fluvio.io/docs/0.15.0/fluvio/apis/nodejs/example>
- Fluvio Node client repository: <https://github.com/fluvio-community/fluvio-client-node>

## Permify Revocation

Permify removes stale relationship grants through `POST /v1/tenants/{tenant_id}/data/delete` with a tuple filter. Role synchronization must delete prior platform role tuples before writing the user’s current role, preventing a demotion from retaining prior access.

- Permify data delete API: <https://docs.permify.co/api-reference/data/delete-data>
- Permify permission check API: <https://docs.permify.co/api-reference/permission/check-api>

## Gateway and WAF deployment

APISIX supports deployment-time environment interpolation in its YAML configuration using the `${{VARIABLE:=default}}` form. The gateway supports OIDC integration with Keycloak; the application keeps procedure-level Keycloak and Permify enforcement because public and authenticated tRPC procedures share the API prefix.

- APISIX environment configuration: <https://apisix.apache.org/docs/apisix/profile/>
- APISIX OpenID Connect plugin: <https://apisix.apache.org/docs/apisix/plugins/openid-connect/>

OpenAppSec protects APISIX using its supported APISIX attachment image paired with an agent container. The upstream Compose example uses `ghcr.io/openappsec/apisix-attachment` and `ghcr.io/openappsec/agent`, with IPC shared between attachment and agent.

- OpenAppSec Docker overview: <https://docs.openappsec.io/getting-started/start-with-docker>
- OpenAppSec Docker Compose guide: <https://docs.openappsec.io/getting-started/start-with-docker/deploy-with-docker-compose>
- Upstream OpenAppSec APISIX Compose reference: <https://raw.githubusercontent.com/openappsec/openappsec/main/deployment/docker-compose/apisix/docker-compose.yaml>

## TigerBeetle and Fluvio deployment

TigerBeetle Docker deployment requires formatting a persistent replica data file before starting it; containers need an unconstrained seccomp profile and memory-lock capability where required. Fluvio Docker deployment requires separate Streaming Controller, setup, and SPU services. The setup step registers the SPU and creates the required topics before producers begin delivery.

- TigerBeetle Docker deployment: <https://docs.tigerbeetle.com/operating/deploying/docker/>
- TigerBeetle start guide: <https://docs.tigerbeetle.com/start/>
- Fluvio Docker Compose guide: <https://fluvio.io/docs/0.16.1/fluvio/installation/docker>

## Keycloak administration

The Keycloak server administration guide confirms the platform model used here: a realm owns users, roles, clients, and service accounts; service accounts obtain OAuth access tokens and can be granted narrowly scoped management roles. The deployment bootstrap therefore creates the platform realm, roles, OIDC client, and a client-credentials administration client rather than embedding user credentials in application code.

- Keycloak Server Administration Guide: <https://www.keycloak.org/docs/latest/server_admin/>
