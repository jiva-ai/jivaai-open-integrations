# Jiva Public API TypeScript SDK

A small TypeScript client for invoking Jiva public workflow APIs from Node.js or browser applications.

## Install

```bash
npm install @jivaai/public-api-typescript
```

For local development from this repository:

```bash
cd jiva-public-api/typescript
npm install
npm run build
```

## Create a Client

Get the workflow ID, Public API URL, and API key from the Jiva Playground.

```typescript
import { JivaPublicApiClient } from "@jivaai/public-api-typescript";

const client = new JivaPublicApiClient({
  apiKey: process.env.JIVA_API_KEY!,
  workflowId: process.env.JIVA_WORKFLOW_ID!,
  // Optional. Defaults to https://api.jiva.ai/public-api
  baseUrl: "https://api.jiva.ai/public-api",
});
```

The API key is sensitive. Do not expose it in browser code unless that is acceptable for your workflow and users.

## Synchronous Invocation

`invokeWorkflow` calls `/workflow/{workflowId}/invoke` and returns the workflow response.

```typescript
const response = await client.invokeWorkflow({
  strings: {
    message: "Write a short customer follow-up email",
  },
});

if (response.errorMessages) {
  console.error(response.errorMessages);
} else {
  console.log(response.strings?.response);
}
```

## Asynchronous Invocation

Use async invocation for long-running workflows. It starts the workflow, then polls for the result.

```typescript
const started = await client.invokeWorkflowAsync({
  json: {
    candidate: {
      name: "Ada Lovelace",
      role: "Engineer",
    },
  },
});

const result = await client.waitForWorkflowResult(started.workflowExecutionId!, {
  intervalMs: 2000,
  timeoutMs: 120000,
});

console.log(result.json);
```

Or use the convenience method:

```typescript
const result = await client.invokeWorkflowAndWait({
  data: {
    rows: [{ "Column 1": 5.2, "Column 2": "value" }],
  },
});
```

## Request Inputs

The request object maps directly to Jiva API Request node types. Only include fields your workflow expects:

```typescript
await client.invokeWorkflowAndWait({
  data: {
    table_input: [{ "Column 1": 5.2, "Column 2": "value" }],
  },
  strings: {
    message: "Summarise this document",
  },
  json: {
    candidate: { name: "Ada", skills: ["typescript"] },
  },
  base64FileBytes: {
    document: "BASE64_FILE_CONTENTS",
  },
  base64MultiFileBytes: {
    documents: ["BASE64_FILE_1", "BASE64_FILE_2"],
  },
  vectorDatabaseIndexIds: {
    knowledge_base: "VECTOR_INDEX_ID",
  },
});
```

The keys inside each map, such as `message`, `document`, or `table_input`, must match the keys configured on the workflow's API Request nodes.

## File Helpers

Use `fileToBase64` for one file, or the client helpers for maps of files.

```typescript
import { fileToBase64 } from "@jivaai/public-api-typescript";
import { readFile } from "node:fs/promises";

const pdf = await readFile("./document.pdf");
const base64 = await fileToBase64(pdf);

const result = await client.invokeWorkflowAndWait({
  base64FileBytes: {
    document: base64,
  },
});
```

For browser `File` objects:

```typescript
const base64FileBytes = await client.buildBase64FileBytes({
  document: fileFromInput,
});

await client.invokeWorkflowAndWait({ base64FileBytes });
```

## Versioned Workflow URLs

If the Playground gives you a URL with a workflow phase, pass it per call:

```typescript
await client.invokeWorkflow(
  { strings: { message: "hello" } },
  { workflowId: "ULTIMATE_PARENT_WORKFLOW_ID", workflowPhase: 2 },
);
```

## Response Helpers

```typescript
import {
  extractWorkflowErrors,
  hasWorkflowError,
  isWorkflowComplete,
} from "@jivaai/public-api-typescript";

if (hasWorkflowError(result)) {
  console.error(extractWorkflowErrors(result));
}

console.log(isWorkflowComplete(result));
```

## Development

```bash
npm install
npm test
npm run build
```
