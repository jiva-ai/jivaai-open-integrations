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

The application will be available at `http://localhost:3000`

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

