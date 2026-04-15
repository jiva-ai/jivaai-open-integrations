# Agent Chat

Agent Chat is how your application talks to a **Jiva.ai agentic chat workflow**: a conversational layer on top of agentic pipelines that you configure in the Jiva platform. This repository ships open SDKs (for example [TypeScript](./typescript/)) so you can build your own UI and orchestration while Jiva runs the agents.

This document explains the **public HTTP contract** as used by the TypeScript client. It is written for engineers implementing new clients and for automated tooling that must infer endpoints, payloads, and response shapes.

---

## Product model (what you configure in Jiva)

1. **Goals and pipelines** — You define goals; Jiva generates **agentic pipelines** (workflows) that carry out work.
2. **Chat interface workflow** — For conversational products, the platform exposes a dedicated **chat workflow** (a normal workflow from the API’s point of view). You receive a **workflow ID** and **API key** for that workflow.
3. **Upload cache workflows** (optional but typical) — File, text, and table content is usually staged through **separate** upload-cache workflows. Each has its own workflow ID (and optionally its own API key and version). The chat workflow then references assets by **asset ID** returned from those uploads.

---

## Negotiation order (how a session typically runs)

There is no separate “login” or connection handshake beyond **HTTPS + `api-key`** on each call. A practical integration still follows a stable order so uploads, turns, statuses, and streaming stay consistent.

### What `sessionId` is

- **`sessionId` is a thread id** — Your application chooses a stable string for each conversational thread (for example a UUID, or `{tenantId}:{userId}:{threadUuid}`). Jiva does not issue it in the public contract; you send it on every chat row, poll, and stream URL for that thread. This is intentional so that you can keep tabs on your own way of modelling chats in your application.
- **One thread, one `sessionId`** — Reusing the same `sessionId` continues the same conversation context (including stream subscription at `.../workflow-chat/{workflowId}/{sessionId}`). Using a **new** `sessionId` starts a **new** conversation; there is no server-side “resume” id in the payloads described here beyond what you reuse.
- **Scoped to the conversation and the Jiva owner** — Uniqueness is in practice **per logical conversation under the identity that owns the workflow** (the **API key** / Jiva user or integration account that invokes the chat workflow). The same `sessionId` string used under **different** API keys is not guaranteed to refer to the same server-side thread; treat **`api-key` + `sessionId`** as the composite key for “this chat” in your design.
- **Same id across a batch** — When you send multiple history rows in one invoke, every row must carry the **same** `sessionId` (as enforced by the reference client).

### 1. Configure and connect (per environment)

- Choose **base URLs**, **workflow IDs**, **versions**, and **API keys** for the chat workflow and any upload-cache workflows.
- Every **invoke** and **stream** request sends **`api-key`**; there is no long-lived session token in the public contract described here.

### 2. Open the stream (recommended, per `sessionId`)

- For a given **`sessionId`** (your thread key), open the **`workflow-chat`** stream when you want live progress (tokens, steps, errors, completion signals).
- You can open it **before** the first turn for that session, or **when** you receive **`RUNNING`** or expect long work—the important part is that the stream is tied to **`workflowId` + `sessionId`**, not to a single HTTP invoke response.
- If you do not use the stream, you rely on **immediate invoke responses** and optional **`POLL_REQUEST`** while `state` is **`RUNNING`**.

### 3. Turn-based conversation (invoke)

- Each **user turn** is a **`POST .../invoke`** on the **chat** workflow with a **`CHAT_REQUEST`** row in `data.default` (optionally preceded by alternating **`CHAT_RESPONSE`** rows to replay history in one batch).
- The assistant’s structured outcome for that turn appears under **`json.default`** (`message`, `executions`, `screens`, etc.).
- **`SCREEN_RESPONSE`** is not a separate HTTP endpoint: it is a **response `mode`** from the server; your **next** invoke satisfies it with the appropriate **`nodeId`**, **`field`**, and **`assetId`** (see uploads below).

### 4. Conversation statuses (`json.default.state`)

Treat **`state`** as the lifecycle of that **invoke** (and, when polling, of the **poll**):

| `state` | Meaning for the client |
|---------|-------------------------|
| **`OK`** | Turn finished successfully; use `message` / `executions`. |
| **`PARTIAL_OK`** | Partial success; inspect `executions` and messages. |
| **`RUNNING`** | Work continues asynchronously; **`id`** is set for **polling** if you are not using only the stream for completion. |
| **`ERROR`** | Turn failed; read `message`, `errorMessages`, and any poll **`logs`**. |

**Response `mode`** (under `json.default`) is separate from **`state`**: e.g. **`SCREEN_RESPONSE`** tells you the agent is blocked on required inputs (`screens`), not that HTTP failed.

### 5. Uploads (when and in what order)

- **Proactive:** If the user already has a file, table, or long text, you may **upload to the cache workflow first**, then send a **`CHAT_REQUEST`** that references the resulting **`assetId`** in the message text or according to your workflow’s expectations.
- **Reactive (`SCREEN_RESPONSE`):** When the last chat response has **`mode: "SCREEN_RESPONSE"`** and a **`screens`** entry, call the right **upload cache** (`FILE_UPLOAD` vs URL-only types as specified), read **`strings.default`** as the **`assetId`**, then **invoke again** with **`SCREEN_RESPONSE`** and **`nodeId`**, **`field`**, **`assetId`** so the agent can continue.

**Summary sequence:** configure keys and URLs → **(optional but recommended)** open **`workflow-chat`** for `sessionId` → **invoke** chat turns → on **`RUNNING`**, prefer stream updates and/or **poll** with **`id`** → on **`SCREEN_RESPONSE`**, **upload** then **invoke** with screen fields → repeat until **`OK`**, **`PARTIAL_OK`**, or **`ERROR`**.

---

## Transport overview

| Mechanism | Role | Recommendation |
|-----------|------|----------------|
| **POST** `.../workflow/{workflowId}/{version}/invoke` | Send chat turns, polls, and upload-cache payloads | Required for sending messages and uploads |
| **Streaming** `.../workflow-chat/{workflowId}/{sessionId}` | Server-pushed updates for a session (see below) | **Preferred** for live UX instead of busy-polling |
| **POST** with `POLL_REQUEST` in body | Check status of a long-running turn | **Supported**, but **not the recommended primary pattern** when a stream is available |

**Polling vs streaming:** You can repeat `POLL_REQUEST` calls when a chat response returns `state: RUNNING`. That mirrors a valid public API pattern, but **Jiva recommends driving the user experience from the real-time stream** (the `workflow-chat` endpoint consumed by the SDK as **Server-Sent Events** over `POST`), and using invoke/poll only as needed for sending input or simple integrations. Frequent polling increases load and can risk throttling; the SDK documentation cites on the order of **one poll per second** when you do poll. Abusive polling may result in connection termination.

---

## Base URLs and paths

Defaults in the reference client:

- **Workflow REST base:** `https://api.jiva.ai/public-api/workflow`  (This is Jiva.ai's production SaaS service. If you are building an on-prem Jiva.ai stack, you replace this with your own hostname)
  **Invoke URL:** `{baseUrl}/{workflowId}/{version}/invoke`  
  Example: `https://api.jiva.ai/public-api/workflow/{yourChatWorkflowId}/0/invoke`

- **Stream base:** `https://api.jiva.ai/public-api` (or derived by stripping a trailing `/workflow` from a custom `baseUrl`)  
  **Stream URL:** `{socketBaseUrl}/workflow-chat/{workflowId}/{sessionId}`

`version` is a string (commonly `"0"`). Non-production environments may use different hosts or versions; the contract is the same.

---

## Authentication

Every HTTP call uses a header:

- **`api-key`:** your workflow’s API key (the chat workflow key for chat invoke and stream; upload caches may use the same key or distinct keys if you configure them that way).

There is no query-string token in the paths shown above; authentication is header-based.

---

## Common response envelope (workflow invoke)

Successful JSON bodies follow a **shared envelope** (upload caches and chat). Fields that matter for integration:

| Field | Meaning |
|--------|---------|
| `workflowExecutionId` | Identifier for that workflow run |
| `errorMessages` | String or null; when non-null, treat as an application-level error even if HTTP status is success |
| `json` | Primary structured result; chat and poll use `json.default` |
| `strings`, `data`, `base64Files`, `vectorDatabaseIndexIds`, `metadata` | Present on the envelope; chat logic usually ignores these except where noted for uploads |

Chat-specific content is almost always under **`json.default`**.

---

## Chat invoke: request body

**Method:** `POST`  
**URL:** `{baseUrl}/{chatWorkflowId}/{version}/invoke`  
**Headers:** `Content-Type: application/json`, `api-key`

**Body shape:**

```json
{
  "data": {
    "default": [ /* one or more message objects */ ]
  }
}
```

Each element of `data.default` is an object with at least:

| Field | Required | Description |
|--------|----------|-------------|
| `sessionId` | Yes | Stable id for the conversation thread (your user/thread key) |
| `message` | Yes | Text content of the turn |
| `mode` | Yes | `CHAT_REQUEST`, `CHAT_RESPONSE`, or `SCREEN_RESPONSE` (see modes below) |
| `nodeId` | For screen follow-up | From `screens[].nodeId` when satisfying a screen |
| `field` | For screen follow-up | From `screens[].field` |
| `assetId` | For screen follow-up | From upload cache `strings.default` after uploading the requested asset |
| `options` | No | e.g. `{ "calculateOjas": true }` to request approximate usage/cost where supported |

**Context (multi-turn) requests:** Send **multiple** objects in `data.default` representing alternating user and assistant turns. Client-side rules in the reference SDK are: same `sessionId` for every row; modes must alternate **`CHAT_REQUEST`** and **`CHAT_RESPONSE`**; when satisfying a screen, **`nodeId`**, **`field`**, and **`assetId`** must all be present together.

**Optional top-level request options:** The TypeScript client can attach the same `options` object to **each** message in the batch when you configure request-level options (e.g. `calculateOjas`).

---

## Chat invoke: conversation modes

| `mode` | When to use |
|--------|----------------|
| `CHAT_REQUEST` | User (or your app) sends a new instruction or reply |
| `CHAT_RESPONSE` | Agent’s prior message in **history** when you send several rows in one invoke |
| `SCREEN_RESPONSE` | Your reply when the last response was `SCREEN_RESPONSE` and you are supplying asset references (`nodeId`, `field`, `assetId`) |

Do not use `POLL_REQUEST` in the same payload shape as a normal chat batch; polling is a separate use (below).

---

## Chat invoke: `json.default` (conversation response)

When the response is a normal chat outcome (not poll), `json.default` is shaped like:

| Field | Type | Description |
|--------|------|-------------|
| `state` | string | `OK`, `RUNNING`, `ERROR`, or `PARTIAL_OK` |
| `mode` | string | `CHAT_RESPONSE` or `SCREEN_RESPONSE` |
| `message` | string | Human-readable summary of the turn |
| `id` | string, optional | Present when `state === "RUNNING"` — **poll correlation id** |
| `executions` | array, optional | Completed execution summaries (see executions) |
| `screens` | array, optional | Required inputs when `mode === "SCREEN_RESPONSE"` |

### Execution summary (`executions[]` in chat response)

Each item typically includes:

- `response` — short text description of that execution  
- `type` — `"text"`, `"json"`, `"table"`, or `"void"`  
- `data` — payload when type is not void  
- `approximateOjasCost` — may appear when options requested cost calculation  

**Ojas:** Figures such as `approximateOjasCost` are **approximate** because it is not always possible at runtime to calculate the exact cost of compute, storage, and related usage. The **Jiva account** usually shows **more accurate** totals, often reconciled **several minutes** after executions complete. Even so, approximate values from the API are typically **within single-digit percentage points** of the true reconciled cost.

### Screen response (`screens[]`)

When the agent needs a file or similar asset, items include:

- `nodeId`, `field` — must be echoed back with the next message  
- `asset.type` — `FILE_POINTER_URL` or `FILE_UPLOAD`  
- `asset.message` — explanation for the user or developer  

You obtain an `assetId` by calling the appropriate **upload cache** workflow, then send a message with `mode: "SCREEN_RESPONSE"` (or the pattern your client uses) including `nodeId`, `field`, and `assetId`.

### Terminal vs async

- **`OK`** — Turn finished; use `message` and `executions` as needed.  
- **`PARTIAL_OK`** — Partial success; inspect `executions` and messages.  
- **`ERROR`** — Failure; check `json.default.message`, `errorMessages`, and any logs in poll responses if you polled.  
- **`RUNNING`** — Turn still executing; **`id`** is set. Either **open/subscribe to the stream** for that `sessionId` (recommended) or **poll** with `POLL_REQUEST` using that `id` until a terminal state.

---

## Polling: request and response

**Same invoke URL** as chat: `POST .../{chatWorkflowId}/{version}/invoke`

**Body:**

```json
{
  "data": {
    "default": [
      {
        "sessionId": "<same session>",
        "id": "<id from RUNNING response>",
        "mode": "POLL_REQUEST"
      }
    ]
  }
}
```

The reference client sends **exactly one** object in `data.default` per poll call.

**`json.default` for poll** (`mode` is `POLL_RESPONSE`):

| Field | Description |
|--------|-------------|
| `state` | Same state machine: `RUNNING` until `OK`, `ERROR`, or `PARTIAL_OK` |
| `logs` | Optional array of strings (progress / trace) |
| `executions` | Optional array of per-execution objects with `startTime`, `state`, and nested `output` (`response`, `type`, `data`) |

Some responses may nest executions under alternative paths; defensive clients mirror the TypeScript `checkCompletionStatus` logic.

**Polling etiquette:** Space polls (on the order of **1 second**). Aggressive polling can be throttled or blocked.

---

## Upload cache workflows

Each upload uses **its own** `workflowId` (and optional `version` / `api-key`) but the **same** `.../invoke` path pattern.

### File upload

**Body:**

```json
{
  "base64FileBytes": {
    "default": "<base64-encoded file bytes>"
  }
}
```

**Asset id:** `strings.default` on the response.

### Text upload

**Body:**

```json
{
  "strings": {
    "default": "<plain text content>"
  }
}
```

**Asset id:** `strings.default`.

### Table upload

**Body:**

```json
{
  "data": {
    "default": [
      { "columnA": "...", "columnB": "..." }
    ]
  }
}
```

Rows are JSON objects with a consistent set of keys. **Asset id:** `strings.default` (same envelope as other uploads).

---

## Real-time stream (`workflow-chat`)

**Recommended** for streaming agent progress, token deltas, and completion instead of polling alone.

**Method:** `POST`  
**URL:** `{socketBaseUrl}/workflow-chat/{workflowId}/{sessionId}`  
**Headers:** `Content-Type: application/json`, `api-key`, `Accept: text/event-stream`  
**Body:** `{}` (empty JSON object in the reference client)

The response is **SSE** (`text/event-stream`): frames with `event:` and `data:` lines, separated by a blank line. The server may emit a `connected` event or plain connection text; **application payloads** in `data:` are JSON objects with at least:

| Field | Description |
|--------|-------------|
| `workflowId` | Chat workflow id |
| `sessionId` | Same session as invoke |
| `message` | Text (e.g. delta, status, or error text) |
| `types` | Array of event type strings (e.g. `CONTENT_DELTA`, `AGENT_COMPLETED`, `ERROR`, `KEEPALIVE`, …) |

The authoritative list of `types` values used by the platform should be taken from the SDK’s type definitions (see [TypeScript `SocketMessageType`](./typescript/src/types.ts)) when generating code.

**Typical integration pattern**

1. `POST` chat invoke with the user message.  
2. If you need live updates, **start the stream for that `sessionId`** before or when you might get `RUNNING`.  
3. Interpret SSE `types` to render streaming UI; close the stream when the agent signals completion or error.  
4. Use the final **`invoke`** response (or last poll, if you must) for structured `executions` and `screens`.

---

## Errors and HTTP status

- **HTTP failure** — Non-success status; body may be JSON with `error`, `message`, or `errorMessages`.  
- **HTTP success with `errorMessages`** — The envelope may still parse; treat `errorMessages` as failure details.  
- **`json.default.state === "ERROR"`** — Application error for that turn; read `message` / logs / `errorMessages`.

---

## SDK reference

For runnable examples, defaults, and helpers (automatic poll until terminal state, SSE reconnection, uploads), see **[TypeScript](./typescript/)** (including its README and `src/api.ts` / `src/types.ts`).

---

## Open source & commercial use

This project is **open source** and **free for commercial use**: use, modify, ship, and contribute under the repository license.

## Getting started

1. Obtain **chat** and **upload cache** workflow IDs, versions, and API keys from the Jiva platform.  
2. Pick a language directory (e.g. [TypeScript](./typescript/)) and follow its README.  
3. Implement **invoke + stream** for the best UX; use **poll** only where simplicity outweighs real-time behavior.

## Support

For questions, issues, or contributions, use the repository’s issue tracker or contact [Jiva.ai support](support@jiva.ai).
