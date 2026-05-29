# n8n-nodes-encelade

This is an n8n community node. It lets you use [Encelade](https://www.encelade.ai) in your n8n workflows.

Encelade turns a prompt and a few hints into a fully designed, on-brand presentation. This package wraps the Encelade public API so you can plan outlines, generate decks, manage presentations, and react to generation events — all from n8n.

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

## Operations

### Encelade (action node)

**Presentation**

| Operation          | Description                                                                | API                                               |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| Generate           | Plan and generate a deck in one async call. Returns a `sessionId` to poll. | `POST /api/public/v1/projects/generate`           |
| Plan Outline       | Generate an editable outline (synchronous by default).                     | `POST /api/public/v1/projects/plan`               |
| Generate From Plan | Build a deck from an existing/edited plan. Async by default.               | `POST /api/public/v1/projects/generate-from-plan` |
| Get                | Retrieve a presentation by ID.                                             | `GET /api/public/v1/projects/{id}`                |
| Get Many           | List presentations (supports Return All).                                  | `GET /api/public/v1/projects`                     |
| Get Published      | Retrieve a published deck by its public slug.                              | `GET /api/public/published/{slug}`                |
| Update             | Update presentation settings.                                              | `PATCH /api/public/v1/projects/{id}`              |
| Delete             | Delete a presentation.                                                     | `DELETE /api/public/v1/projects/{id}`             |

**Session**

| Operation  | Description                                  | API                                          |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| Get Status | Poll a generation session for status/result. | `GET /api/public/v1/sessions/{sessionId}`    |
| Cancel     | Cancel an in-progress generation.            | `DELETE /api/public/v1/sessions/{sessionId}` |

The **Generate** and **Plan Outline** operations both expose **Topic**, **Outline Hints** (required) and **Page Count** up front. Everything else — Tone, Audience, Image Style, Verbosity, Model, Theme, Theme Mode, Media Provider, Icon Family, Call To Action (text + toggle), Deep Research, Use Connectors, End-User Email/Role, Callback URL — lives under **Additional Fields**, plus a **Supporting Materials** collection.

> **Polling is not handled inside the node.** `Generate` returns a `sessionId` immediately; you decide how to wait (a Wait node + Get Status loop, or the Encelade Trigger node). This keeps long-running generations from tying up an n8n worker.

### Encelade Trigger (trigger node)

Starts a workflow when a generation finishes. On activation it registers a webhook with Encelade (`POST /api/public/v1/webhooks`) using the node's webhook URL and a generated secret; on deactivation it removes it. Inbound calls are verified against the `X-Webhook-Signature` HMAC-SHA256 header, so unsigned/forged requests are rejected.

- **Generation Completed** (`generation.completed`)
- **Generation Failed** (`generation.failed`)

## Credentials

You need an Encelade API token.

1. Sign in to [Encelade](https://www.encelade.ai) and create an API token in your account/API settings.
2. Grant the scopes your workflow needs (each operation needs only the scopes listed):
   - `project:plan` — Plan Outline
   - `project:plan` + `project:generate` — Generate (it plans _then_ generates, so it needs both)
   - `project:generate` — Generate From Plan
   - `project:read` — Get / Get Many (also the credential Test button)
   - `project:write` — Update
   - `project:delete` — Delete
   - `session:read` — Get Status
   - `session:write` — Cancel
   - `webhook:read` + `webhook:write` — Encelade Trigger
3. In n8n create **Encelade API** credentials and paste the token into **API Key**. The token is sent as `Authorization: Bearer <token>` and the tenant is derived from the token — no extra header needed.
4. **Base URL** defaults to `https://www.encelade.ai`; change it only for self-hosted deployments.

Use the credential's **Test** button to verify the token (it calls `GET /api/public/v1/projects?limit=1`).

> The Test button needs the `project:read` scope, since that is the endpoint it probes. Full-access tokens (OAuth-minted or legacy tokens with no scope restriction) and any token that includes `project:read` pass it. A narrowly-scoped token without `project:read` (for example a generate-only or webhook-only token) is still valid and will work in its operations, but the Test button will report a 403 — add `project:read` if you want it to pass.

## Compatibility

Built and tested against n8n with `n8n-workflow` 2.x (n8n nodes API version 1). Requires Node.js 20+.

## Usage

### Generate → Poll (recommended)

**Generate** plans _and_ builds the deck in a single call — there is no separate plan step to run first. Planning happens inside the operation, which is why the initial response reads `status: "planning"`. It returns a `sessionId` immediately; you then poll for the result:

1. **Encelade → Generate** with a Topic and at least one Outline Hint → returns `{ sessionId, status: "planning" }`.
2. **Wait** node (e.g. 15–30s).
3. **Encelade → Session: Get Status** with the `sessionId`.
4. **IF** `phase` is `done` → continue (the response includes `projectPid` and `link`; `shareLink` is present only when the deck was generated for an end user via End-User Email). If `phase` is `failed` → handle the error. Otherwise loop back to the Wait node.
5. Optionally **Encelade → Get** or **Get Published** to fetch the finished deck.

### Review the outline first (optional)

Use this only when a human (or another workflow step) needs to review or edit the outline before slides are built. Note that **Generate ignores a plan** — to build from an edited outline you must use **Generate From Plan**, not Generate:

1. **Encelade → Plan Outline** with a Topic and Outline Hints → returns an editable `plan`.
2. Edit the `plan` as needed (e.g. a Set/Edit Fields node or a manual approval step).
3. **Encelade → Generate From Plan** with that plan → returns a `sessionId`.
4. Poll **Session → Get Status** as in steps 2–5 above.

### Event-driven (no polling)

Instead of polling, add an **Encelade Trigger** node, subscribe to **Generation Completed** / **Generation Failed**, and activate the workflow before generating. The trigger fires with `{ event, sessionId, projectPid, timestamp }` when the deck is ready.

> Generation typically takes up to ~3 minutes for a 10–15 page deck (longer with Deep Research).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Encelade](https://www.encelade.ai)
