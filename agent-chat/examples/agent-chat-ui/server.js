import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const sdkPath = join(__dirname, '..', '..', 'typescript', 'dist', 'index.js');
const { JivaApiClient } = require(sdkPath);

const app = express();
const portArg = process.argv[2];
const PORT = (portArg && /^\d+$/.test(portArg) ? parseInt(portArg, 10) : null) ?? process.env.PORT ?? 3000;

app.use(cors());
// Increase JSON body size limit to support base64-encoded uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// Store client instances per session (in production, use proper session management)
const clients = new Map();

// Track server-side SSE subscriptions so the SDK runs subscribeToSocket and logs socket messages to stdout.
// Key: same as clients (JSON.stringify(settings)); value: Set of sessionIds we've subscribed for.
const socketSubscriptions = new Map();

/**
 * Get or create a JivaApiClient instance based on settings
 */
function getClient(settings) {
  const key = JSON.stringify(settings);
  if (!clients.has(key)) {
    try {
      const client = new JivaApiClient({
        apiKey: settings.chatApiKey || '',
        workflowId: settings.chatWorkflowId || '',
        workflowVersion: settings.chatWorkflowVersion || '0',
        fileUploadCacheWorkflowId: settings.fileUploadCacheWorkflowId || '',
        fileUploadCacheVersion: settings.fileUploadCacheVersion || '0',
        fileUploadCacheApiKey: settings.fileUploadCacheApiKey || settings.chatApiKey || '',
        textUploadCacheWorkflowId: settings.textUploadCacheWorkflowId || '',
        textUploadCacheVersion: settings.textUploadCacheVersion || '0',
        textUploadCacheApiKey: settings.textUploadCacheApiKey || settings.chatApiKey || '',
        tableUploadCacheWorkflowId: settings.tableUploadCacheWorkflowId || '',
        tableUploadCacheVersion: settings.tableUploadCacheVersion || '0',
        tableUploadCacheApiKey: settings.tableUploadCacheApiKey || settings.chatApiKey || '',
        baseUrl: settings.baseUrl || undefined,
        socketBaseUrl: settings.socketBaseUrl || undefined,
      });
      clients.set(key, client);
    } catch (error) {
      throw new Error(`Failed to create client: ${error.message}`);
    }
  }
  return clients.get(key);
}

/**
 * POST /api/chat - Send a chat message
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, settings, mode, nodeId, field, assetId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    if (!settings) {
      return res.status(400).json({ error: 'settings are required' });
    }

    const client = getClient(settings);

    const conversationRequest = {
      sessionId,
      message,
      mode: mode || 'CHAT_REQUEST',
    };

    if (nodeId) {
      conversationRequest.nodeId = nodeId;
    }
    if (field) {
      conversationRequest.field = field;
    }
    if (assetId) {
      conversationRequest.assetId = assetId;
    }

    // Subscribe via SDK before initiating so socket messages are logged to stdout.
    const clientKey = JSON.stringify(settings);
    if (!socketSubscriptions.has(clientKey)) {
      socketSubscriptions.set(clientKey, new Set());
    }
    if (!socketSubscriptions.get(clientKey).has(sessionId)) {
      socketSubscriptions.get(clientKey).add(sessionId);
      client.subscribeToSocket(sessionId, {
        onMessage: () => { /* SDK logs to stdout via logger.debug */ },
      });
    }

    // Initiate conversation (after subscribe so server connection is ready for events)
    const response = await client.initiateConversation(conversationRequest);

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    // Return the response immediately - polling will be handled client-side
    res.json(response.data);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/upload/file - Upload a file
 */
app.post('/api/upload/file', async (req, res) => {
  try {
    const { file, settings } = req.body;

    if (!file || !settings) {
      return res.status(400).json({ error: 'file and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadFile(file);

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    res.json(response.data);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/upload/text - Upload text
 */
app.post('/api/upload/text', async (req, res) => {
  try {
    const { text, settings } = req.body;

    if (!text || !settings) {
      return res.status(400).json({ error: 'text and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadText(text);

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    res.json(response.data);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/upload/table - Upload table data
 */
app.post('/api/upload/table', async (req, res) => {
  try {
    const { tableData, settings } = req.body;

    if (!tableData || !settings) {
      return res.status(400).json({ error: 'tableData and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadTable(tableData);

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    res.json(response.data);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/poll - Poll for conversation status
 */
app.post('/api/poll', async (req, res) => {
  try {
    const { sessionId, executionId, settings } = req.body;

    if (!sessionId || !executionId) {
      return res.status(400).json({ error: 'sessionId and executionId are required' });
    }

    if (!settings) {
      return res.status(400).json({ error: 'settings are required' });
    }

    const client = getClient(settings);

    const response = await client.poll({
      sessionId,
      id: executionId,
      mode: 'POLL_REQUEST',
    });

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    res.json(response.data);
  } catch (error) {
    console.error('Poll error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

