# Jiva.ai Agent Chat - TypeScript SDK

A comprehensive TypeScript SDK for integrating with Jiva.ai's agentic workflows. This library provides a simple, type-safe interface for building conversational AI applications powered by Jiva.ai's agentic workflow engine.

## Features

- 🤖 **Full Agentic Workflow Integration** - Seamlessly interact with Jiva.ai's agentic workflows
- 💬 **Conversational Interface** - Support for multi-turn conversations with context
- 📤 **Asset Upload Support** - Upload files, text, and tables to satisfy agent requirements
- 🔄 **Automatic Polling** - Handles async workflow execution with automatic polling
- 📡 **Real-Time Updates** - Subscribe to live agent updates via Server-Sent Events (SSE)
- 🎯 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 📝 **Built-in Logging** - Configurable logging for debugging and monitoring

## Quick Start

### 1. Installation

If you're using this package from npm:

```bash
npm install @jivaai/agent-chat-typescript
```

If you're using this package directly from the repository:

```bash
cd agent-chat/typescript
npm install
npm run build
```

### 2. Get Your Credentials

Before you can use the SDK, you'll need to obtain the following from your Jiva.ai platform project:

1. **Main Chat Workflow ID** - The workflow ID for your agent chat backend
2. **API Key** - Your API key for authentication
3. **Upload Cache Workflow IDs** - Workflow IDs for:
   - File Upload Cache
   - Text Upload Cache
   - Table Upload Cache

These can be found in your Jiva.ai platform project settings. The upload cache workflows are typically created alongside your main chat workflow.

### 3. Create a Client Instance

```typescript
import { JivaApiClient } from '@jivaai/agent-chat-typescript';

const client = new JivaApiClient({
  // Required: Main chat workflow configuration
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
  workflowVersion: '0', // Optional, defaults to "0"
  
  // Required: Upload cache workflow IDs
  fileUploadCacheWorkflowId: 'file-cache-workflow-id',
  textUploadCacheWorkflowId: 'text-cache-workflow-id',
  tableUploadCacheWorkflowId: 'table-cache-workflow-id',
  
  // Optional: Upload cache versions (default to workflowVersion or "0")
  fileUploadCacheVersion: '0',
  textUploadCacheVersion: '0',
  tableUploadCacheVersion: '0',
  
  // Optional: Separate API keys for upload caches (default to apiKey)
  fileUploadCacheApiKey: 'file-cache-api-key',
  textUploadCacheApiKey: 'text-cache-api-key',
  tableUploadCacheApiKey: 'table-cache-api-key',
  
  // Optional: Custom base URLs (for testing or different environments)
  baseUrl: 'https://api.jiva.ai/public-api/workflow',
  socketBaseUrl: 'https://api.jiva.ai/public-api',
  
  // Optional: Logging configuration
  logging: {
    level: 'info', // 'debug' | 'info' | 'warn' | 'error' | 'silent'
    enabled: true,
  },
});
```

### 4. Start a Conversation

```typescript
// Initiate a conversation with the agent
const response = await client.initiateConversation({
  sessionId: 'user-123-thread-1', // Unique session ID per user/thread
  message: 'create a professional RFQ document', // obviously, this needs to be relevant to your agent
  mode: 'CHAT_REQUEST',
});

// Handle the response
if (response.error) {
  console.error('Error:', response.error);
} else if (response.data) {
  const conversationData = response.data.json.default;
  
  if (conversationData.state === 'OK') {
    console.log('Success:', conversationData.message);
    
    // Process execution results
    if (conversationData.executions) {
      conversationData.executions.forEach((exec) => {
        console.log(`Execution: ${exec.response} (${exec.type})`);
      });
    }
  } else if (conversationData.state === 'ERROR') {
    console.error('Error:', response.data.errorMessages);
  }
}
```

That's it! The SDK automatically handles:
- ✅ Async workflow execution (polling when state is `RUNNING`)
- ✅ Error handling
- ✅ Response parsing

## How the API Works

### Architecture Overview

The Jiva.ai Agent Chat SDK communicates with Jiva.ai's agentic workflow engine through REST APIs and Server-Sent Events (SSE):

1. **Main Chat Workflow** - Handles conversation requests and agent interactions
2. **Upload Cache Workflows** - Store uploaded assets (files, text, tables) that agents can reference
3. **EventSource (SSE)** - Provides real-time updates during agent processing

### Request Flow

```
┌─────────────┐
│ Your App    │
└──────┬──────┘
       │
       │ 1. initiateConversation()
       ▼
┌─────────────────────────┐
│ JivaApiClient           │
│ - Validates request     │
│ - Sends POST request    │
└──────┬──────────────────┘
       │
       │ 2. POST /workflow/{workflowId}/{version}/invoke
       ▼
┌─────────────────────────┐
│ Jiva.ai API             │
│ - Processes request     │
│ - Returns state:        │
│   • OK (immediate)      │
│   • RUNNING (async)     │
│   • ERROR               │
└──────┬──────────────────┘
       │
       │ 3. If RUNNING, auto-poll
       ▼
┌─────────────────────────┐
│ Polling (automatic)     │
│ - Polls every 1s        │
│ - Max 30 attempts       │
│ - Returns when complete │
└─────────────────────────┘
```

### Response States

The API returns responses with different states:

- **OK** - Request processed immediately, result is available
- **RUNNING** - Request is being processed asynchronously (SDK automatically polls)
- **PARTIAL_OK** - Partial results are available
- **ERROR** - Request failed with an error

### Response Modes

- **CHAT_RESPONSE** - Normal response with execution results
- **SCREEN_RESPONSE** - Response indicating that assets are required (check `screens` array)

## Usage Guide

### Basic Conversation

The simplest way to interact with the agent:

```typescript
const response = await client.initiateConversation({
  sessionId: 'user-123-thread-1',
  message: 'Hello, what can you help me with?',
  mode: 'CHAT_REQUEST',
});

if (response.data?.json.default.state === 'OK') {
  console.log('Agent response:', response.data.json.default.message);
}
```

### Conversations with Context

Provide conversation history for context-aware interactions:

```typescript
const response = await client.initiateConversation(
  [
    {
      sessionId: 'user-123-thread-1',
      message: 'RFQs are generally single-pagers',
      mode: 'CHAT_REQUEST',
    },
    {
      sessionId: 'user-123-thread-1',
      message: 'ok',
      mode: 'CHAT_RESPONSE',
    },
    {
      sessionId: 'user-123-thread-1',
      message: 'create a professional RFQ document',
      mode: 'CHAT_REQUEST',
    },
  ],
  {
    maxAttempts: 30, // Optional: max polling attempts (default: 30)
    pollInterval: 1000, // Optional: polling interval in ms (default: 1000)
  }
);
```

**Important Notes:**
- All messages must have the same `sessionId`
- `CHAT_REQUEST` and `CHAT_RESPONSE` must alternate in the array
- The first message can be either `CHAT_REQUEST` or `CHAT_RESPONSE`

### Handling Screen Responses

Sometimes the agent requires additional assets (like files) to complete a request. When this happens, the response will have `mode: 'SCREEN_RESPONSE'` and include a `screens` array.

```typescript
const response = await client.initiateConversation({
  sessionId: 'session-123',
  message: 'create a professional RFQ document',
  mode: 'CHAT_REQUEST',
});

if (response.data?.json.default.mode === 'SCREEN_RESPONSE') {
  const screens = response.data.json.default.screens;
  
  screens?.forEach((screen) => {
    console.log(`Screen ${screen.nodeId}: ${screen.asset.message}`);
    console.log(`Asset type: ${screen.asset.type}`);
    
    if (screen.asset.type === 'FILE_UPLOAD') {
      // Upload file and satisfy the screen (see below)
    }
  });
}
```

### Uploading Assets

The SDK provides methods to upload files, text, and tables. These methods return an `assetId` that can be used to satisfy screen responses.

#### Uploading a File

```typescript
// In browser environments, you can upload File or Blob objects
const file = new File(['file content'], 'document.pdf', { 
  type: 'application/pdf' 
});

const uploadResponse = await client.uploadFile(file);

if (uploadResponse.data) {
  const assetId = uploadResponse.data.strings.default;
  console.log('File uploaded, assetId:', assetId);
  // Cache this assetId for later use with the same sessionId
}
```

```typescript
// In Node.js environments, provide base64 string directly
const base64String = 'base64-encoded-file-content';
const uploadResponse = await client.uploadFile(base64String);

const assetId = uploadResponse.data?.strings.default;
```

#### Uploading Text

```typescript
const textResponse = await client.uploadText(
  'This is the text content to upload'
);

const assetId = textResponse.data?.strings.default;
```

#### Uploading Table Data

```typescript
const tableData = [
  { name: 'John', age: 30, city: 'New York' },
  { name: 'Jane', age: 25, city: 'Boston' },
  { name: 'Bob', age: 35, city: 'Chicago' },
];

const tableResponse = await client.uploadTable(tableData);

const assetId = tableResponse.data?.strings.default;
```

### Satisfying Screen Responses

After uploading assets and receiving an `assetId`, you can satisfy the screen by including `nodeId`, `field`, and `assetId` in your follow-up request:

```typescript
// 1. Make initial request
const response = await client.initiateConversation({
  sessionId: 'session-123',
  message: 'create a professional RFQ document',
  mode: 'CHAT_REQUEST',
});

// 2. Check for screen response
if (response.data?.json.default.mode === 'SCREEN_RESPONSE') {
  const screen = response.data.json.default.screens?.[0];
  
  if (screen?.asset.type === 'FILE_UPLOAD') {
    // 3. Upload the file
    const file = /* get file from user */;
    const uploadResponse = await client.uploadFile(file);
    
    if (uploadResponse.data) {
      const assetId = uploadResponse.data.strings.default;
      
      // 4. Satisfy the screen with the uploaded asset
      const followUp = await client.initiateConversation({
        sessionId: 'session-123',
        message: 'create a professional RFQ document',
        mode: 'CHAT_REQUEST',
        nodeId: screen.nodeId,
        field: screen.field,
        assetId: assetId,
      });
    }
  }
}
```

**Important Notes:**
- All three fields (`nodeId`, `field`, `assetId`) must be provided together when satisfying a screen
- The `nodeId` and `field` come from the `screens` array in the `SCREEN_RESPONSE`
- The `assetId` comes from uploading to File Upload Cache, Text Upload Cache, or Table Upload Cache endpoints
- Asset IDs should be cached on your backend - they can be reused for the same `sessionId`
- Asset semantics are session-specific: an asset for one `sessionId` may not be valid for another

### Real-Time Updates with EventSource

Subscribe to real-time updates from the agent using Server-Sent Events (SSE). This allows you to receive live updates as the agent processes requests, including thinking messages, execution results, and progress updates.

```typescript
// Subscribe to real-time updates for a session
const es = client.subscribeToSocket(
  'session-123', // Session ID
  {
    onOpen: () => {
      console.log('EventSource connected');
    },
    onMessage: (message) => {
      console.log('Message:', message.message);
      console.log('Types:', message.types);
      
      // Handle different message types
      if (message.types.includes('AGENT_THINKING')) {
        console.log('Agent is thinking...');
      } else if (message.types.includes('AGENT_COMPLETED')) {
        console.log('Agent completed successfully');
      } else if (message.types.includes('CONTENT_DELTA')) {
        // Streaming content
        process.stdout.write(message.message);
      } else if (message.types.includes('FINAL_RESULT')) {
        console.log('Final result:', message.message);
      }
    },
    onClose: (event) => {
      console.log('EventSource closed:', event.reason);
    },
    onError: (error) => {
      console.error('EventSource error:', error);
    },
    onReconnect: (attempt) => {
      console.log(`Reconnecting... (attempt ${attempt})`);
    },
  },
  {
    autoReconnect: true, // Automatically reconnect on disconnect
    reconnectInterval: 3000, // Wait 3 seconds between reconnection attempts
    maxReconnectAttempts: 10, // Maximum number of reconnection attempts
  }
);

// Close the connection when done
es.close();
```

#### Socket Message Types

The socket can send various message types. Here are some common ones:

- **AGENT_STARTED** - Agent has begun processing
- **AGENT_THINKING** - Agent is analyzing and planning
- **AGENT_COMPLETED** - Agent finished successfully
- **AGENT_FAILED** - Agent encountered an error
- **CONTENT_DELTA** - Incremental text content (streaming)
- **CONTENT_COMPLETE** - Full text content block
- **EXECUTION_CALL_STARTED** - Agent is invoking a pipeline
- **EXECUTION_CALL_RESULT** - Result from an execution
- **FINAL_RESULT** - Final output from the pipeline
- **PROGRESS_UPDATE** - Progress percentage or status
- **TOKEN_USAGE** - Token consumption metrics
- **ERROR** - Error message with details
- **KEEPALIVE** - Heartbeat to keep connection alive

And many more. See the full list in the type definitions.

#### Socket Options

- **autoReconnect** (default: `true`) - Automatically attempt to reconnect on disconnect
- **reconnectInterval** (default: `3000`) - Delay in milliseconds between reconnection attempts
- **maxReconnectAttempts** (default: `10`) - Maximum number of reconnection attempts before giving up

#### Example: Real-Time Chat with EventSource

```typescript
// Start a conversation
const response = await client.initiateConversation({
  sessionId: 'session-123',
  message: 'create a professional RFQ document',
  mode: 'CHAT_REQUEST',
});

// Subscribe to real-time updates
const es = client.subscribeToSocket('session-123', {
  onMessage: (message) => {
    if (message.types.includes('CONTENT_DELTA')) {
      // Stream content to user
      updateUI(message.message);
    } else if (message.types.includes('AGENT_COMPLETED')) {
      console.log('Agent finished processing');
      es.close();
    } else if (message.types.includes('ERROR')) {
      console.error('Error:', message.message);
      es.close();
    }
  },
});
```

**Note:** 
- The EventSource URL is constructed from the `socketBaseUrl` (defaults to `https://api.jiva.ai/public-api`) and follows the pattern: `{socketBaseUrl}/workflow-chat/{workflowId}/{sessionId}`
- API endpoints follow the pattern: `{baseUrl}/{workflowId}/{version}/invoke` where version defaults to "0"
- For test environments, you can set custom `baseUrl` and version numbers in the client configuration

### Manual Polling

If you need to manually poll for a result (e.g., for multiple IDs simultaneously), you can use the `poll()` method:

```typescript
// Poll for a specific execution ID
const pollResponse = await client.poll(
  {
    sessionId: 'user-123-thread-1', // Required: session ID from original request
    id: 'exec-456', // Required: ID from the RUNNING response
    mode: 'POLL_REQUEST', // Required: must be POLL_REQUEST
  },
  (data) => {
    // Success callback (optional)
    console.log('State:', data.json.default.state);
    if (data.json.default.logs) {
      console.log('Logs:', data.json.default.logs);
    }
    if (data.json.default.executions) {
      data.json.default.executions.forEach((exec) => {
        console.log(`Execution state: ${exec.output.state}`);
        console.log(`Output: ${exec.output.response} (${exec.output.type})`);
      });
    }
  },
  (error) => {
    // Error callback (optional)
    console.error('Error:', error);
  }
);

// Handle the response
if (pollResponse.error) {
  console.error('Poll failed:', pollResponse.error);
} else if (pollResponse.data) {
  const pollData = pollResponse.data.json.default;
  
  if (pollData.state === 'OK') {
    console.log('Processing complete!');
  } else if (pollData.state === 'RUNNING') {
    console.log('Still processing...');
    // Poll again after recommended 1 second delay
  } else if (pollData.state === 'PARTIAL_OK') {
    console.log('Partial results available');
  } else if (pollData.state === 'ERROR') {
    console.error('Error:', pollResponse.data.errorMessages);
  }
}
```

**Note**: Only 1 sessionId can be polled per call. If you need to poll multiple IDs, make separate API calls simultaneously. The recommended polling frequency is 1 second to avoid being blacklisted.

### Using Promises (without callbacks)

All methods return promises, so you can use async/await or `.then()`:

```typescript
// The methods return promises, so you can use async/await or .then()
const response = await client.post({ message: 'Hello' });

if (response.error) {
  console.error('Error:', response.error);
} else {
  console.log('Data:', response.data);
}
```

### Logging

The SDK includes built-in logging with different log levels. By default, logging is enabled and uses:
- **Production**: `warn` level (warnings and errors only)
- **Development**: `debug` level (all messages)

You can configure logging in the client initialization:

```typescript
const client = new JivaApiClient({
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
  // ... other config ...
  logging: {
    level: 'debug', // 'debug' | 'info' | 'warn' | 'error' | 'silent'
    enabled: true,  // Enable/disable logging
  },
});
```

**Log Levels:**
- `debug`: Detailed information (URLs, payloads, responses) - most verbose
- `info`: General flow information (method calls, state changes)
- `warn`: Warnings (retries, fallbacks, timeouts)
- `error`: Errors (API errors, network errors)
- `silent`: No logging output

**Using a Custom Logger:**

You can provide your own logger implementation:

```typescript
import { Logger } from '@jivaai/agent-chat-typescript';

const customLogger: Logger = {
  debug(message: string, ...args: unknown[]): void {
    // Your custom debug logging
  },
  info(message: string, ...args: unknown[]): void {
    // Your custom info logging
  },
  warn(message: string, ...args: unknown[]): void {
    // Your custom warn logging
  },
  error(message: string, ...args: unknown[]): void {
    // Your custom error logging
  },
};

const client = new JivaApiClient({
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
  // ... other config ...
  logging: {
    logger: customLogger,
    level: 'info',
  },
});
```

**Disable Logging:**

```typescript
const client = new JivaApiClient({
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
  // ... other config ...
  logging: {
    enabled: false, // Disable all logging
  },
});
```

### Using Custom Base URL (for testing)

```typescript
const testClient = new JivaApiClient({
  apiKey: 'test-api-key',
  workflowId: 'test-workflow-id',
  fileUploadCacheWorkflowId: 'test-file-cache-workflow-id',
  textUploadCacheWorkflowId: 'test-text-cache-workflow-id',
  tableUploadCacheWorkflowId: 'test-table-cache-workflow-id',
  baseUrl: 'https://test-api.example.com/workflow',
  socketBaseUrl: 'https://test-api.example.com',
});
```

## Development

### Build

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Test

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run only end-to-end tests:

```bash
npm test -- e2e.test.ts
```

Run integration tests (requires local Jiva.ai instance):

```bash
# Remove .skip from describe block in integration.test.ts first
npm test -- integration.test.ts
```

Run integration tests (they are skipped by default):

```bash
# On Unix/Linux/Mac:
RUN_INTEGRATION_TESTS=true npm test -- integration.test.ts

# On Windows (PowerShell):
$env:RUN_INTEGRATION_TESTS="true"; npm test -- integration.test.ts

# On Windows (CMD):
set RUN_INTEGRATION_TESTS=true && npm test -- integration.test.ts
```

**Note**: Integration tests are skipped by default and require a running local Jiva.ai instance. They will only run when `RUN_INTEGRATION_TESTS=true` is explicitly set.

### Lint

```bash
npm run lint
```

## Project Structure

```
typescript/
├── src/              # Source code
│   ├── __tests__/   # Test files
│   ├── api.ts       # Main API client implementation
│   ├── types.ts     # TypeScript type definitions
│   ├── logger.ts    # Logging utilities
│   └── index.ts     # Main entry point
├── dist/            # Compiled output (generated)
├── package.json     # Dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── jest.config.js   # Jest test configuration
```

## API Reference

### JivaApiClient

Main client class for interacting with the Jiva.ai Agent Chat API.

#### Constructor

```typescript
new JivaApiClient(config: ApiConfig)
```

#### Methods

##### `initiateConversation(request, options?, onSuccess?, onError?)`

Initiates a conversation with the Jiva.ai agent.

- **request**: `InitiateConversationRequest | InitiateConversationWithContext` - Single message or array of messages
- **options**: `PollingOptions` (optional) - Polling configuration
- **onSuccess**: `SuccessCallback<ConversationResponse>` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<ConversationResponse>>`

##### `poll(request, onSuccess?, onError?)`

Manually polls for the status of a running conversation.

- **request**: `PollRequest` - Poll request with sessionId, id, and mode
- **onSuccess**: `SuccessCallback<PollResponse>` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<PollResponse>>`

##### `uploadFile(file, onSuccess?, onError?)`

Uploads a file to the File Upload Cache.

- **file**: `File | Blob | string` - File to upload (File/Blob in browser, base64 string in Node.js)
- **onSuccess**: `SuccessCallback<UploadResponse>` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<UploadResponse>>`

##### `uploadText(text, onSuccess?, onError?)`

Uploads text to the Text Upload Cache.

- **text**: `string` - Text content to upload
- **onSuccess**: `SuccessCallback<UploadResponse>` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<UploadResponse>>`

##### `uploadTable(tableData, onSuccess?, onError?)`

Uploads table data to the Table Upload Cache.

- **tableData**: `Record<string, unknown>[]` - Table data to upload
- **onSuccess**: `SuccessCallback<UploadResponse>` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<UploadResponse>>`

##### `subscribeToSocket(sessionId, callbacks?, options?)`

Creates a Server-Sent Events (SSE) connection to subscribe to real-time agent updates.

- **sessionId**: `string` - Session ID to subscribe to
- **callbacks**: `SocketCallbacks` (optional) - Event callbacks
- **options**: `SocketOptions` (optional) - Socket connection options
- **Returns**: `{ url: string; close: () => void; readyState: number }`

##### `get(endpoint?, onSuccess?, onError?)`

Makes a GET request to the API.

- **endpoint**: `string` (optional) - Endpoint path
- **onSuccess**: `SuccessCallback` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<T>>`

##### `post(payload?, endpoint?, onSuccess?, onError?)`

Makes a POST request to the API.

- **payload**: `Record<string, unknown>` (optional) - JSON payload
- **endpoint**: `string` (optional) - Endpoint path
- **onSuccess**: `SuccessCallback` (optional) - Success callback
- **onError**: `ErrorCallback` (optional) - Error callback
- **Returns**: `Promise<ApiResponse<T>>`

## Type Definitions

All TypeScript types are exported from the main entry point. Key types include:

- `ApiConfig` - Client configuration
- `InitiateConversationRequest` - Single conversation message
- `InitiateConversationWithContext` - Array of conversation messages
- `ConversationResponse` - Response from conversation request
- `PollRequest` - Poll request payload
- `PollResponse` - Poll response payload
- `UploadResponse` - Upload response payload
- `SocketMessage` - Real-time socket message
- `SocketCallbacks` - Socket event callbacks
- `SocketOptions` - Socket connection options
- `Logger` - Custom logger interface

See `src/types.ts` for complete type definitions.

# Installing on npm

```
npm login
npm publish
```