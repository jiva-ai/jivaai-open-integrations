# Jiva.ai Agent Chat - TypeScript SDK

A simple and clean TypeScript library for integrating with the Jiva.ai Agent Chat API.

## Installation

```bash
npm install
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

## Usage

This library is designed to be downloaded and used directly in your applications.

### Basic Example

```typescript
import { JivaApiClient } from '@jivaai/agent-chat-typescript';

// Create a client instance
const client = new JivaApiClient({
  apiKey: 'your-api-key', // Main chat API key (also used as default for upload caches)
  workflowId: 'your-workflow-id', // Main chat workflow ID
  workflowVersion: '0', // Optional: Workflow version (defaults to "0")
  fileUploadCacheWorkflowId: 'file-cache-workflow-id', // File Upload Cache workflow ID
  fileUploadCacheVersion: '0', // Optional: File Upload Cache version (defaults to workflowVersion or "0")
  fileUploadCacheApiKey: 'file-cache-api-key', // Optional: File Upload Cache API key (defaults to apiKey)
  textUploadCacheWorkflowId: 'text-cache-workflow-id', // Text Upload Cache workflow ID
  textUploadCacheVersion: '0', // Optional: Text Upload Cache version (defaults to workflowVersion or "0")
  textUploadCacheApiKey: 'text-cache-api-key', // Optional: Text Upload Cache API key (defaults to apiKey)
  tableUploadCacheWorkflowId: 'table-cache-workflow-id', // Table Upload Cache workflow ID
  tableUploadCacheVersion: '0', // Optional: Table Upload Cache version (defaults to workflowVersion or "0")
  tableUploadCacheApiKey: 'table-cache-api-key', // Optional: Table Upload Cache API key (defaults to apiKey)
  baseUrl: 'https://api.jiva.ai/public-api/workflow', // Optional: API base URL
  socketBaseUrl: 'https://platform.jiva.ai/api', // Optional: EventSource (SSE) base URL
  logging: {
    // Optional: Logging configuration
    level: 'info', // 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'warn' in production, 'debug' in development)
    enabled: true, // Enable/disable logging (default: true)
  },
});

// Make a POST request
const response = await client.post(
  { message: 'Hello, Jiva.ai!' },
  undefined, // endpoint (optional)
  (data) => {
    console.log('Success:', data);
  },
  (error) => {
    console.error('Error:', error);
  }
);

// Make a GET request
const getResponse = await client.get(
  'messages', // endpoint (optional)
  (data) => {
    console.log('Success:', data);
  },
  (error) => {
    console.error('Error:', error);
  }
);
```

### Using Custom Base URL (for testing)

```typescript
const testClient = new JivaApiClient({
  apiKey: 'test-api-key',
  workflowId: 'test-workflow-id',
  baseUrl: 'https://test-api.example.com/workflow',
});
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

### Using Promises (without callbacks)

```typescript
// The methods return promises, so you can use async/await or .then()
const response = await client.post({ message: 'Hello' });

if (response.error) {
  console.error('Error:', response.error);
} else {
  console.log('Data:', response.data);
}
```

### Initiating a Conversation

The main feature of this library is initiating conversations with the Jiva.ai agent. The `sessionId` is **required** and should be unique to your end-user (you can use formats like `[user-id]-[thread-id]`).

```typescript
import { JivaApiClient } from '@jivaai/agent-chat-typescript';

const client = new JivaApiClient({
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
});

// Initiate a conversation
const response = await client.initiateConversation(
  {
    sessionId: 'user-123-thread-1', // Required: unique session ID
    message: 'create a professional RFQ document', // Required: your message
    mode: 'CHAT_REQUEST', // Required: CHAT_REQUEST, CHAT_RESPONSE, or SCREEN_RESPONSE
  },
  {
    maxAttempts: 30, // Optional: max polling attempts for RUNNING state (default: 30)
    pollInterval: 1000, // Optional: polling interval in ms (default: 1000)
  },
  (data) => {
    // Success callback (optional)
    console.log('Response:', data.json.default.message);
    console.log('State:', data.json.default.state);
    if (data.json.default.executions) {
      data.json.default.executions.forEach((exec) => {
        console.log(`Execution: ${exec.response} (${exec.type})`);
      });
    }
  },
  (error) => {
    // Error callback (optional)
    console.error('Error:', error);
  }
);

// Handle the response
if (response.error) {
  console.error('Request failed:', response.error);
} else if (response.data) {
  const conversationData = response.data.json.default;
  
  if (conversationData.state === 'OK') {
    console.log('Success:', conversationData.message);
    // Process executions, screens, etc.
  } else if (conversationData.state === 'ERROR') {
    console.error('Error:', response.data.errorMessages);
  }
}
```

#### Adding Context to Conversations

You can provide context by passing an array of messages. The messages must alternate between `CHAT_REQUEST` and `CHAT_RESPONSE`, and all messages must have the same `sessionId`.

```typescript
// Initiate a conversation with context
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
    maxAttempts: 30,
    pollInterval: 1000,
  },
  (data) => {
    console.log('Response:', data.json.default.message);
  },
  (error) => {
    console.error('Error:', error);
  }
);
```

**Important Notes:**
- All messages must have the same `sessionId`
- `CHAT_REQUEST` and `CHAT_RESPONSE` must alternate in the array
- The first message can be either `CHAT_REQUEST` or `CHAT_RESPONSE`
- Single message format (object) is still supported for backward compatibility

#### Response States and Modes

**Response States:**
- **OK**: Request processed immediately, result is available
- **RUNNING**: Request is being processed asynchronously (automatically polled)
- **PARTIAL_OK**: Edge case where partial results are available
- **ERROR**: Request failed with an error

**Response Modes:**
- **CHAT_RESPONSE**: Normal response with execution results
- **SCREEN_RESPONSE**: Response indicating that assets are required (check `screens` array)

The library automatically handles polling when the state is `RUNNING`, so you don't need to manually poll for results.

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
      // Upload file using File Upload Cache endpoint
      // (See your Jiva platform project for File Upload Cache API details)
      // The upload will return an assetId
    }
  });
}
```

#### Satisfying Screen Responses

After uploading assets and receiving an `assetId`, you can satisfy the screen by including `nodeId`, `field`, and `assetId` in your follow-up request:

```typescript
// After uploading a file and receiving assetId from File Upload Cache
const assetId = 'uploaded-asset-id-123';

// Satisfy the screen with the uploaded asset
const response = await client.initiateConversation({
  sessionId: 'session-123',
  message: 'create a professional RFQ document',
  mode: 'CHAT_REQUEST',
  nodeId: 'node-123',        // From the screen response
  field: 'file-field',       // From the screen response
  assetId: assetId,          // From the upload response
});
```

**Important Notes:**
- All three fields (`nodeId`, `field`, `assetId`) must be provided together when satisfying a screen
- The `nodeId` and `field` come from the `screens` array in the `SCREEN_RESPONSE`
- The `assetId` comes from uploading to File Upload Cache, Text Upload Cache, or Table Upload Cache endpoints
- Asset IDs should be cached on your backend - they can be reused for the same `sessionId`
- Asset semantics are session-specific: an asset for one `sessionId` may not be valid for another

#### Uploading Assets

The library provides methods to upload files, text, and tables to their respective cache endpoints. These methods return an `assetId` that can be used to satisfy screen responses.

**Uploading a File:**

```typescript
// In browser environments, you can upload File or Blob objects
const file = new File(['file content'], 'document.pdf', { type: 'application/pdf' });
const uploadResponse = await client.uploadFile(
  file,
  (response) => {
    const assetId = response.strings.default;
    console.log('File uploaded, assetId:', assetId);
    // Cache this assetId for later use with the same sessionId
  },
  (error) => {
    console.error('Upload failed:', error);
  }
);

// In Node.js environments, provide base64 string directly
const base64String = 'base64-encoded-file-content';
const uploadResponse = await client.uploadFile(base64String);

// Extract the assetId
const assetId = uploadResponse.data?.strings.default;
```

**Note:** In browser environments, you can pass `File` or `Blob` objects directly. In Node.js environments, provide the file as a base64-encoded string.

**Uploading Text:**

```typescript
const textResponse = await client.uploadText(
  'This is the text content to upload',
  (response) => {
    const assetId = response.strings.default;
    console.log('Text uploaded, assetId:', assetId);
  },
  (error) => {
    console.error('Upload failed:', error);
  }
);

const assetId = textResponse.data?.strings.default;
```

**Uploading Table Data:**

```typescript
const tableData = [
  { name: 'John', age: 30, city: 'New York' },
  { name: 'Jane', age: 25, city: 'Boston' },
  { name: 'Bob', age: 35, city: 'Chicago' },
];

const tableResponse = await client.uploadTable(
  tableData,
  (response) => {
    const assetId = response.strings.default;
    console.log('Table uploaded, assetId:', assetId);
  },
  (error) => {
    console.error('Upload failed:', error);
  }
);

const assetId = tableResponse.data?.strings.default;
```

**Complete Example - Handling Screen Response with Upload:**

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

**Note:** The upload cache workflow IDs are found in your Jiva platform project, alongside the main chat workflow. They are required when creating the client instance.

### Subscribing to Real-Time Updates (EventSource / Server-Sent Events)

You can subscribe to real-time updates from the agent using EventSource (Server-Sent Events). This allows you to receive live updates as the agent processes requests, including thinking messages, execution results, and progress updates.

**Note**: The `eventsource` package is included as a dependency and will be installed automatically. In browsers, EventSource is available natively, but the package is still included for compatibility. Node.js users will use the `eventsource` package automatically.

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
      ws.close();
    } else if (message.types.includes('ERROR')) {
      console.error('Error:', message.message);
      ws.close();
    }
  },
});
```

**Note:** 
- The EventSource URL is constructed from the `socketBaseUrl` (defaults to `https://platform.jiva.ai/api`) and follows the pattern: `https://{socketBaseUrl}/ws/workflow-chat/{workflowId}/{sessionId}`. EventSource URLs use HTTPS (not WSS) and do not include `/invoke`.
- API endpoints follow the pattern: `https://{baseUrl}/{workflowId}/{version}/invoke` where version defaults to "0". For test environments, you can set custom `baseUrl` and version numbers in the client configuration.

### Manual Polling

If you need to manually poll for a result (e.g., for multiple IDs simultaneously), you can use the `poll()` method:

```typescript
import { JivaApiClient } from '@jivaai/agent-chat-typescript';

const client = new JivaApiClient({
  apiKey: 'your-api-key',
  workflowId: 'your-workflow-id',
});

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
        console.log(`Execution state: ${exec.state}`);
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

## Project Structure

```
typescript/
├── src/              # Source code
│   ├── __tests__/   # Test files
│   └── index.ts     # Main entry point
├── dist/            # Compiled output (generated)
├── package.json     # Dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── jest.config.js   # Jest test configuration
```

