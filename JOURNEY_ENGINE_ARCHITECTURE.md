# Reusable Stakeholder Journey Engine

## Purpose

The journey engine executes the twenty catalogued stakeholder journeys as **parameterized Temporal workflows**. It does not encode rights, credit, legal, valuation, tax, identity, provider, registry, or payment decisions. Instead, it validates eligibility, invokes existing guarded domain services through declared adapters, records evidence, pauses for authorized human intervention, and emits durable completion or recovery state.

## Reusable contract

| Concern | Implementation rule |
|---|---|
| Template | One stable catalog identifier (`J01`–`J20`) with role eligibility, allowed subject kinds, adapter sequence, PWA/mobile launch metadata, and decision boundary. |
| Run | A user starts a template with role, subject, reference, and a caller-supplied idempotency key. The database enforces one active run per actor/template/idempotency key. |
| Workflow identity | `stakeholder-journey-{runKey}`. A duplicate Temporal start resolves to the same persisted run rather than duplicating actions. |
| Step | Each adapter emits an immutable run event and a materialized step state. A failed step records a retryable failure; a blocked step preserves the owner, explanation, and required intervention. |
| Human intervention | The workflow waits for an authorized signal. The server checks authorization before forwarding a `continue`, `block`, or `cancel` decision. |
| Evidence | All decisions, service outcomes, external references, and actor identities are hash-addressable run events. Sensitive provider payloads are not persisted in the journey record. |
| Domain adapter | Adapters call existing server services only. They validate required contextual references, create a bounded domain handoff where supported, and never bypass domain authorization or human review. |
| Recovery | Workflows use bounded retry, deterministic input, and a durable run state. Operators may retry a failed retryable run or cancel it; they cannot mark a run completed without its declared steps. |

## Adapter classes

The engine uses six reusable adapter types. Templates select them by configuration rather than embedding bespoke workflow code.

| Adapter | Real platform integration |
|---|---|
| `onboarding_readiness` | Stakeholder onboarding and activation reconciliation. |
| `document_evidence` | Fail-closed document-verification request or reviewer-handoff evidence. |
| `registry_case` | Registry Operations Cloud account, queue, and case workflow. |
| `commercial_case` | Lender collateral, conveyancing, field-survey, valuation/tax, right-of-way, or portfolio account workflows. |
| `marketplace_case` | Verified provider, directory request, or dispute workflow. |
| `rollout_assurance` | Jurisdiction, import, reconciliation, recovery, and assisted-service controls. |

## Security and control boundaries

The engine uses server-side authorization for every start, intervention, retry, and cancellation. A template declares the minimum actor roles and only accepts bounded subject references. The activity layer never directly updates a parcel owner, registry title, assessment amount, legal conclusion, credit decision, tax decision, payment status, verification outcome, or authority gate.

## Coverage meaning

A journey is **repository-verified** only if its template, persistence, workflow path, declared adapter coverage, intervention path, and client launch are tested. It is **target-environment accepted** only after configured identity, authorization, verification, payment, Dapr, Temporal, provider, and statutory acceptance evidence is present. The engine exposes both states separately; it never converts a local test pass into an authoritative service decision.
