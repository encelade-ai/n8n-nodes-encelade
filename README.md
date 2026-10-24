# n8n-nodes-encelade

This is an n8n community node. It lets you use [Encelade](https://www.encelade.ai) in your n8n workflows.

Encelade turns a brief into a fully designed, on-brand presentation. This package wraps the Encelade public API so you can generate decks, one-pagers and proposals, manage presentations, and react to generation events — all from n8n.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short: in your n8n instance go to **Settings → Community Nodes → Install**, enter `n8n-nodes-encelade`, and confirm. After installation you will have two nodes available: **Encelade** (actions) and **Encelade Trigger** (events).

A ready-to-import example workflow lives in **[`examples/generate-deck.json`](examples/generate-deck.json)** — it generates a deck from a brief and polls the run until it's ready. Import it (n8n → **⋯ → Import from File**), select your Encelade API credential on the two Encelade nodes, and run.

## Operations

### Encelade (action node)

**Presentation**

| Operation     | Description                                        | API                                   |
| ------------- | -------------------------------------------------- | ------------------------------------- |
| Generate      | Start a generation run. Returns a `runId` to poll. | `POST /api/public/v1/generation/runs` |
| Get           | Retrieve a presentation by ID.                     | `GET /api/public/v1/projects/{id}`    |
| Get Many      | List presentations (supports Return All).          | `GET /api/public/v1/projects`         |
| Get Published | Retrieve a published deck by its public slug.      | `GET /api/public/published/{slug}`    |
| Update        | Update presentation settings.                      | `PATCH /api/public/v1/projects/{id}`  |
| Delete        | Delete a presentation.                             | `DELETE /api/public/v1/projects/{id}` |

**Generation Run**

| Operation | Description                         | API                                                  |
| --------- | ----------------------------------- | ---------------------------------------------------- |
| Get       | Get a run's status, plan and link.  | `GET /api/public/v1/generation/runs/{runId}`         |
| Cancel    | Cancel a run that has not finished. | `POST /api/public/v1/generation/runs/{runId}/cancel` |

**Generate** takes a **Brief** (required: what to make plus any notes or data, up to 200,000 characters), an **Artifact Type** (Deck, One-Pager or Proposal) and a **Page Count** (Auto or 4–50, up to your plan's page limit; a one-pager is always one page). Audience, Tone, Call To Action, Language, Research, Style (decks), One-Pager Design (one-pagers), Theme and Fit To Page Cap live under **Additional Fields**.

> **Polling is not handled inside the node.** `Generate` returns `{ runId, projectPid, status: "queued" }` immediately; you decide how to wait (a Wait node + Generation Run → Get loop, or the Encelade Trigger node). This keeps long-running generations from tying up an n8n worker.

### Encelade Trigger (trigger node)

Starts a workflow when a generation finishes. On activation it registers a webhook with Encelade (`POST /api/public/v1/webhooks`) using the node's webhook URL and a generated secret; on deactivation it removes it. Inbound calls are verified against the `X-Webhook-Signature` HMAC-SHA256 header, so unsigned/forged requests are rejected.

- **Generation Completed** (`generation.completed`)
- **Generation Failed** (`generation.failed`)

## Credentials

You need an Encelade API token.

1. Get a token the quick way at **[encelade.ai/setup/n8n](https://www.encelade.ai/setup/n8n)** — sign in and click **Mint** (it provisions your account if needed). Or create one manually in your Encelade account / API settings.
2. Grant the scopes your workflow needs (each operation needs only the scopes listed):
   - `project:generate` — Generate
   - `project:read` — Get / Get Many (also the credential Test button)
   - `project:write` — Update
   - `project:delete` — Delete
   - `session:read` — Generation Run → Get
   - `session:write` — Generation Run → Cancel
   - `webhook:read` + `webhook:write` — Encelade Trigger
3. In n8n create **Encelade API** credentials and paste the token into **API Key**. The token is sent as `Authorization: Bearer <token>` and the tenant is derived from the token — no extra header needed.
4. **Base URL** defaults to `https://www.encelade.ai`; change it only for self-hosted deployments.

Use the credential's **Test** button to verify the token (it calls `GET /api/public/v1/projects?limit=1`).

> The Test button needs the `project:read` scope, since that is the endpoint it probes. Full-access tokens (OAuth-minted or legacy tokens with no scope restriction) and any token that includes `project:read` pass it. A narrowly-scoped token without `project:read` (for example a generate-only or webhook-only token) is still valid and will work in its operations, but the Test button will report a 403 — add `project:read` if you want it to pass.

## Compatibility

Built and tested against n8n with `n8n-workflow` 2.x (n8n nodes API version 1). Requires Node.js 20+.

## Usage

### Generate → Poll (recommended)

1. **Encelade → Generate** with a Brief → returns `{ runId, projectPid, status: "queued" }`.
2. **Wait** node (e.g. 15 seconds).
3. **Encelade → Generation Run: Get** with the `runId`.
4. **IF** `status` is `done` → continue with `link` (the project URL). If it is `failed` or `canceled` → handle the error (`error` is `{ stage, code }`). Otherwise loop back to the Wait node.
5. Optionally **Encelade → Get** with the `projectPid` to fetch the finished deck.

### Event-driven (no polling)

Instead of polling, add an **Encelade Trigger** node, subscribe to **Generation Completed** / **Generation Failed**, and activate the workflow before generating. The trigger fires with `{ event, runId, projectPid, timestamp }`, plus `error` on failure.

> A run takes a few minutes.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Encelade](https://www.encelade.ai)
