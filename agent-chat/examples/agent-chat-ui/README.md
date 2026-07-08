# Jiva.ai Agent Chat UI

A simple web application for interacting with the Jiva.ai Agent Chat API. This application provides a chatbot interface with real-time updates via WebSocket, similar to modern AI chatbots like Cursor.

## Logo Setup

To display the Jiva.ai logo in the header, place a `logo.png` file in the `public/` directory. The logo will automatically appear in the header. If the logo file is not found, it will be hidden gracefully.

## Features

- **Chat Interface**: Clean, modern UI for sending messages and viewing responses
- **Real-time Updates**: WebSocket integration shows agent thinking and progress in real-time
- **Settings Management**: Configure chat endpoint, cache endpoints, and API keys
- **Settings Persistence**: Settings are saved in browser localStorage

## Prerequisites

- Node.js 18+ 
- The TypeScript SDK must be built (run `npm run build` in `../typescript`, i.e. the `typescript` integration implementation in this repo)

## Installation

Assuming you're in the `agent-chat` directory.

1. Ensure the TypeScript SDK is built:
   ```bash
   cd typescript
   npm run build
   ```

2. Navigate to this directory:
   ```bash
   cd examples/agent-chat-ui
   ```

3. Install dependencies:
   ```bash
   npm install
   ```



## Running the Application

Start the server:
```bash
npm start
```

Or run in development mode with auto-reload:
```bash
npm run dev
```

The application will be available at `http://localhost:3000` (or pass a port as the first numeric argument, e.g. `npm start -- 4000`).

### Debug mode (`--debug`)

For connection issues (REST invoke, SSE stream) and payload problems, start the server with **`--debug`** (or **`-d`**):

```bash
node server.js --debug
# or with a custom port:
node server.js 4000 --debug
```

NPM shortcuts:

```bash
npm run start:debug
npm run dev:debug
```

You can also set **`JIVA_DEBUG=1`** or **`DEBUG=true`** in the environment instead of the flag.

With debug enabled:

- **Terminal**: logs each proxied request (masked API keys), full JSON sent to `initiateConversation` / poll, upload sizes, and SDK `debug`-level logs (URLs, payloads, responses).
- **Debug Log panel**: shows extra entries (SSE chunks, raw event text, full per-message payloads, poll “still running” noise, etc.) and opens the panel expanded on load.
- **Browser console**: mirrors each Debug Log line under the prefix `[Jiva Agent Chat]`.

Without `--debug`, the UI keeps high-signal request/response/error lines and hides the noisiest `debug`-type rows.

## Configuration

1. Click the **Settings** button in the top right
2. Configure the following:
   - **Chat Endpoint**: The base URL for the chat API (default: `https://api.jiva.ai/public-api/workflow`)
   - **Chat Workflow ID**: Your main chat workflow ID
   - **Chat API Key**: Your API key for the chat endpoint
   - **File/Text/Table Upload Cache**: Workflow IDs and API keys for upload cache endpoints
   - **Socket Base URL**: WebSocket base URL (default: `https://platform.jiva.ai/api`)

3. Click **Save Settings** to persist your configuration

## Usage

1. Configure your settings (see above)
2. Type a message in the input field
3. Press Enter or click Send
4. Watch real-time updates as the agent processes your request:
   - Thinking messages appear in yellow
   - Content streams in as it's generated
   - Final results are displayed when complete
   - Errors are shown in red
   - `USER_INPUT_DETAIL` screening payload events are consumed from the stream but hidden from the chat UI because their `message` payload is structured JSON rather than user-facing text

### Socket connectivity test (`SOCKET_TEST`)

The chat UI sends normal `CHAT_REQUEST` turns. To run the server’s **socket connectivity test** (simulated ~10s agent run, no real workflows), use **`mode: "SOCKET_TEST"`** via curl or your own script while the UI (or SDK) keeps the SSE stream open for the same `sessionId`:

1. Start this app (`npm start`) and open it in the browser so settings and the stream are active, **or** open the stream yourself with the SDK/`curl` (see [Agent Chat README](../../README.md#socket-connectivity-test)).
2. Use a dedicated test `sessionId` (the UI generates one per page load; copy it from the debug log if `--debug` is enabled, or pick your own UUID for curl-only tests).
3. Invoke the chat workflow with a single row:

```bash
curl -X POST "https://api.jiva.ai/public-api/workflow/{chatWorkflowId}/0/invoke" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_CHAT_API_KEY" \
  -d '{
    "data": {
      "default": [{
        "sessionId": "YOUR_SESSION_ID",
        "message": "Socket connectivity test",
        "mode": "SOCKET_TEST"
      }]
    }
  }'
```

Expect `json.default.state: "RUNNING"` and `mode: "CHAT_RESPONSE"`. On the open SSE stream, verify the simulated `types` sequence (`AGENT_THINKING`, `EXECUTION_CALL_STARTED`, … `AGENT_COMPLETED`) over ~10 seconds. Optionally poll with `POLL_REQUEST` until `state: "OK"`. This mode is for **diagnostics only**, not end-user chat.

## Architecture

- **Backend** (`server.js`): Express server that proxies API requests to keep API keys secure
- **Frontend** (`public/`): HTML/CSS/JavaScript application with WebSocket integration
- **Settings**: Stored in browser localStorage

## Project Structure

```
agent-chat-ui/
├── server.js          # Express server
├── package.json       # Dependencies
├── public/           # Frontend files
│   ├── index.html    # Main HTML
│   ├── styles.css    # Styling
│   └── app.js        # Frontend logic
└── README.md         # This file
```

## Notes

- Settings are stored in browser localStorage and persist across sessions
- Each conversation uses a unique session ID
- WebSocket connections are automatically managed
- The application handles both immediate responses and async polling

## Polling Behavior

The application automatically polls for conversation results when the backend returns a `RUNNING` state:

- **Initial Poll**: Happens immediately when a `RUNNING` response is received
- **Subsequent Polls**: Occur every 5 seconds until a terminal state is reached
- **Terminal States**: Polling stops when the conversation state is:
  - `OK` - Request completed successfully
  - `ERROR` - Request failed
  - `PARTIAL_OK` - Partial results available
- **Continues Polling**: While the conversation state remains `RUNNING`

The polling logic matches the backend behavior: it checks the conversation state (`json.default.state`) rather than individual execution states, ensuring accurate completion detection.

