# Jiva Public API

The Jiva Public API lets external applications invoke Jiva workflows by sending inputs to API Request nodes and reading outputs from API Response nodes. Each workflow exposes a public URL and an `api-key` header value from the Jiva Playground.

Use the API key like a password. Anyone with the key can invoke the workflow it belongs to.

## Base URL

Use the Public API URL shown in the Playground. In production it follows this shape:

```text
https://api.jiva.ai/public-api/workflow/{workflowId}
```

Some environments or older documents may show a different host. Prefer the URL shown by the Playground for the workflow you are invoking.

## Authentication

Every request must include:

```text
api-key: YOUR_WORKFLOW_API_KEY
```

## Request Body

Send JSON to `/invoke` for a synchronous call or `/invoke-async` for an asynchronous call. The top-level keys map to different API Request node types:

```json
{
  "data": {
    "table_input": [{ "Column 1": 5.2, "Column 2": "value" }]
  },
  "strings": {
    "message": "Summarise this document"
  },
  "json": {
    "candidate": { "name": "Ada", "skills": ["typescript"] }
  },
  "base64FileBytes": {
    "document": "BASE64_FILE_CONTENTS"
  },
  "base64MultiFileBytes": {
    "documents": ["BASE64_FILE_1", "BASE64_FILE_2"]
  },
  "vectorDatabaseIndexIds": {
    "knowledge_base": "VECTOR_INDEX_ID"
  }
}
```

Only include the fields your workflow expects. The object keys, such as `message` or `document`, must match the keys configured on the corresponding API Request nodes.

## Synchronous Invocation

`/invoke` starts the workflow and waits up to the workflow's configured maximum wait time.

```bash
curl -X POST "https://api.jiva.ai/public-api/workflow/YOUR_WORKFLOW_ID/invoke" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_API_KEY" \
  -d '{
    "strings": {
      "message": "Write a short customer follow-up email"
    }
  }'
```

If the workflow completes within the wait time, the response contains output values:

```json
{
  "workflowExecutionId": "EXECUTION_ID",
  "strings": {
    "response": "Thanks for your time today..."
  },
  "data": {},
  "base64Files": {},
  "base64MultiFiles": {},
  "json": {},
  "vectorDatabaseIndexIds": {},
  "metadata": {}
}
```

If the workflow fails or times out, `errorMessages` is returned.

## Asynchronous Invocation

`/invoke-async` starts the workflow and immediately returns an execution ID.

```bash
curl -X POST "https://api.jiva.ai/public-api/workflow/YOUR_WORKFLOW_ID/invoke-async" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_API_KEY" \
  -d '{
    "json": {
      "candidate": {
        "name": "Ada Lovelace",
        "role": "Engineer"
      }
    }
  }'
```

Example response:

```json
{
  "workflowId": "YOUR_WORKFLOW_ID",
  "workflowExecutionId": "EXECUTION_ID",
  "errorMessages": {}
}
```

Poll the async response endpoint until the result no longer contains `inProgressMessages` and contains outputs or `errorMessages`:

```bash
curl -X POST "https://api.jiva.ai/public-api/workflow/YOUR_WORKFLOW_ID/EXECUTION_ID/invoke-async-response" \
  -H "api-key: YOUR_API_KEY"
```

In-progress response:

```json
{
  "workflowExecutionId": "EXECUTION_ID",
  "inProgressMessages": {
    "In Progress": ["Workflow currently executing."]
  }
}
```

## File Inputs

For most integrations, send files as base64 strings in JSON.

Single file:

```bash
BASE64_FILE="$(base64 -w 0 ./document.pdf)"

curl -X POST "https://api.jiva.ai/public-api/workflow/YOUR_WORKFLOW_ID/invoke-async" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_API_KEY" \
  -d "{
    \"base64FileBytes\": {
      \"document\": \"$BASE64_FILE\"
    }
  }"
```

Multiple files for one Multi-File API Request node:

```bash
curl -X POST "https://api.jiva.ai/public-api/workflow/YOUR_WORKFLOW_ID/invoke-async" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_API_KEY" \
  -d '{
    "base64MultiFileBytes": {
      "documents": ["BASE64_FILE_1", "BASE64_FILE_2"]
    }
  }'
```

There are also legacy multipart endpoints such as `/invoke-with-file` and `/invoke-with-file-async`. Prefer JSON base64 payloads for new integrations because they support named file inputs consistently.

## Versioned Workflow URLs

Some public URLs include a workflow phase:

```text
https://api.jiva.ai/public-api/workflow/{ultimateParentWorkflowId}/{workflowPhase}/invoke
```

Use this form when the Playground gives you a URL with a phase segment. Otherwise, invoke by `workflowId`.

## TypeScript SDK

A TypeScript client is available in [`typescript`](./typescript):

```bash
npm install @jivaai/public-api-typescript
```

```typescript
import { JivaPublicApiClient } from "@jivaai/public-api-typescript";

const client = new JivaPublicApiClient({
  apiKey: process.env.JIVA_API_KEY!,
  workflowId: process.env.JIVA_WORKFLOW_ID!,
});

const result = await client.invokeWorkflowAndWait({
  strings: { message: "Summarise this text" },
});
```
