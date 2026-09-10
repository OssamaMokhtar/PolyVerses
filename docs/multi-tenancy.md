# Multi-Tenancy — PolyVerses

**Status:** Architecture document — for implementation planning.

## The Problem

PolyVerses is designed as a multi-tenant SaaS: multiple product teams, each with their own agents, workflows, prompts, and data. The current prototype is not run as a hosted multi-tenant service. This document defines the multi-tenancy architecture.

## Tenant Model

### Tenant

A tenant is a product team or organization using PolyVerses. A tenant has:

- **Own agents:** the team's specialist AI agents
- **Own workflows:** the team's multi-agent orchestration workflows
- **Own prompts:** the team's prompt library
- **Own data:** agent run traces, prompt iterations, workflow definitions
- **Own users:** team members with roles (admin, product leader, viewer, agent designer)
- **Own settings:** model provider preferences, rate limits, security settings

### Tenant Isolation

Tenants must be isolated from each other:

- **Data isolation:** Tenant A cannot access Tenant B's data (agent traces, prompts, workflows)
- **Agent isolation:** Tenant A's agents cannot run on Tenant B's workflows
- **Prompt isolation:** Tenant A's prompts cannot be used by Tenant B's agents
- **User isolation:** Tenant A's users cannot access Tenant B's account

## Implementation Approaches

### Approach A: Firestore Path-Based Isolation

Use Firestore security rules to enforce tenant isolation via document paths:

```
/tenants/{tenantId}/agents/{agentId}
/tenants/{tenantId}/workflows/{workflowId}
/tenants/{tenantId}/prompts/{promptId}
/tenants/{tenantId}/runs/{runId}
/tenants/{tenantId}/users/{userId}
```

Security rules check that the requesting user belongs to the tenant whose data they're accessing.

**Pros:** Simple, Firestore-native, security rules enforce isolation at the database level
**Cons:** Firestore-only, less flexible for complex queries across tenants

### Approach B: Database-Level Isolation

Use a separate database (or Firestore project) per tenant.

**Pros:** Strongest isolation, harder to accidentally cross tenant boundaries
**Cons:** More complex deployment, more expensive at scale, harder to manage

### Approach C: Row-Level Isolation with Tenant ID

Use a single database with a `tenantId` field on every document. Security rules and application logic enforce tenant isolation.

**Pros:** Simple, flexible, works with any database
**Cons:** Isolation is enforced by application logic + security rules, not by database structure

## Recommended Approach

**Approach A (Firestore path-based isolation)** is recommended for PolyVerses, given the existing Firestore architecture. Security rules already support path-based checks.

## Authentication & Authorization

### Authentication

- SSO (SAML/OIDC) for enterprise tenants
- Email/password for smaller teams (or Firebase Auth with email link)
- Social login (Google, GitHub) for individual users

### Authorization (RBAC)

| Role | Permissions |
|------|-------------|
| Admin | Full access to tenant: manage agents, workflows, prompts, users, settings |
| Product Leader | Run workflows, view observability, edit prompts, view analytics |
| Viewer | View observability, run pre-defined workflows, read-only access |
| Agent Designer | Create and edit agents, test agents, view agent run traces |

## Rate Limiting

Rate limiting must be per-tenant, not just per-user:

- Each tenant has a rate limit (agent runs per minute, workflow executions per hour, etc.)
- Rate limit exceeds triggers an error, not a silent degradation
- Rate limit state is shared across serverless instances (Vercel KV or Redis)

## Deployment

- **Single deployment, multi-tenant:** One Firestore project, one set of serverless functions, tenant isolation via security rules and application logic
- **Per-tenant deployment (optional):** Large enterprise tenants may want their own deployment (own Firestore project, own serverless functions, own domain)

## Relationship to Improvement Plan

This multi-tenancy architecture is Phase 2 of the PolyVerses improvement plan. See [[05-Improvement-Plan-PolyVerses]].
