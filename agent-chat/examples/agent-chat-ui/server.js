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

function parseServerArgs(argv) {
  let port =
    process.env.PORT != null && /^\d+$/.test(String(process.env.PORT))
      ? parseInt(process.env.PORT, 10)
      : 3000;
  if (Number.isNaN(port)) port = 3000;

  const envDebug = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());
  let debug = envDebug(process.env.JIVA_DEBUG) || envDebug(process.env.DEBUG);

  for (const arg of argv) {
    if (arg === '--debug' || arg === '-d') {
      debug = true;
    } else if (/^\d+$/.test(arg)) {
      port = parseInt(arg, 10);
    }
  }
  return { port, debug };
}

const { port: PORT, debug: DEBUG } = parseServerArgs(process.argv.slice(2));

const app = express();

app.use(cors());
// Increase JSON body size limit to support base64-encoded uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/api/app-config', (req, res) => {
  res.json({ debug: DEBUG });
});

// Store client instances per session (in production, use proper session management)
const clients = new Map();

function maskSettingsForLog(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = { ...settings };
  for (const k of Object.keys(out)) {
    if (/apikey|api_key|token|password|secret|auth/i.test(k)) {
      out[k] = typeof out[k] === 'string' && out[k] ? '***' : out[k];
    }
  }
  return out;
}

function debugServer(label, detail) {
  if (!DEBUG) return;
  if (detail !== undefined) {
    console.log(`[jiva-agent-chat-ui] ${label}`, detail);
  } else {
    console.log(`[jiva-agent-chat-ui] ${label}`);
  }
}

function truncateForLog(value, maxChars = 12000) {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}\n... truncated (${s.length} chars total)`;
  } catch {
    return String(value);
  }
}

const sdkLogging = DEBUG
  ? { level: 'debug', enabled: true }
  : { level: 'warn', enabled: true };

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
        logging: sdkLogging,
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
    const { message, sessionId, settings, mode, nodeId, field, assetId, requestUsageStats } = req.body;

    debugServer('POST /api/chat', {
      sessionId,
      messageLength: typeof message === 'string' ? message.length : null,
      mode: mode || 'CHAT_REQUEST',
      nodeId: nodeId || null,
      field: field || null,
      hasAssetId: !!assetId,
      settings: maskSettingsForLog(settings),
    });

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

    const calculateOjas = !!(requestUsageStats ?? settings?.requestUsageStats);
    const pollingOptions = calculateOjas
      ? { requestOptions: { calculateOjas } }
      : {};

    // Build the exact payload sent to the API (for logging); options go on each conversation message
    const apiPayload = {
      data: {
        default: [
          { ...conversationRequest, ...(calculateOjas ? { options: { calculateOjas } } : {}) },
        ],
      },
    };
    debugServer('[SDK] initiateConversation payload', JSON.stringify(apiPayload, null, 2));

    // Initiate conversation
    const response = await client.initiateConversation(conversationRequest, pollingOptions);

    debugServer('[SDK] initiateConversation result', {
      status: response.status,
      error: response.error || null,
      hasData: response.data !== undefined,
      data: response.data !== undefined ? truncateForLog(response.data) : undefined,
    });

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

    debugServer('POST /api/upload/file', {
      settings: maskSettingsForLog(settings),
      fileBase64Length: typeof file === 'string' ? file.length : null,
    });

    if (!file || !settings) {
      return res.status(400).json({ error: 'file and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadFile(file);

    debugServer('[SDK] uploadFile result', {
      status: response.status,
      error: response.error || null,
      hasData: response.data !== undefined,
      data: response.data !== undefined ? truncateForLog(response.data) : undefined,
    });

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

    debugServer('POST /api/upload/text', {
      settings: maskSettingsForLog(settings),
      textLength: typeof text === 'string' ? text.length : null,
    });

    if (!text || !settings) {
      return res.status(400).json({ error: 'text and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadText(text);

    debugServer('[SDK] uploadText result', {
      status: response.status,
      error: response.error || null,
      hasData: response.data !== undefined,
      data: response.data !== undefined ? truncateForLog(response.data) : undefined,
    });

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

    debugServer('POST /api/upload/table', {
      settings: maskSettingsForLog(settings),
      tableDataKeys: tableData && typeof tableData === 'object' ? Object.keys(tableData) : null,
    });

    if (!tableData || !settings) {
      return res.status(400).json({ error: 'tableData and settings are required' });
    }

    const client = getClient(settings);
    const response = await client.uploadTable(tableData);

    debugServer('[SDK] uploadTable result', {
      status: response.status,
      error: response.error || null,
      hasData: response.data !== undefined,
      data: response.data !== undefined ? truncateForLog(response.data) : undefined,
    });

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

    debugServer('POST /api/poll', {
      sessionId,
      executionId,
      settings: maskSettingsForLog(settings),
    });

    if (!sessionId || !executionId) {
      return res.status(400).json({ error: 'sessionId and executionId are required' });
    }

    if (!settings) {
      return res.status(400).json({ error: 'settings are required' });
    }

    const client = getClient(settings);

    const pollPayload = {
      sessionId,
      id: executionId,
      mode: 'POLL_REQUEST',
    };
    debugServer('[SDK] poll payload', pollPayload);

    const response = await client.poll({
      sessionId,
      id: executionId,
      mode: 'POLL_REQUEST',
    });

    debugServer('[SDK] poll result', {
      status: response.status,
      error: response.error || null,
      hasData: response.data !== undefined,
      data: response.data !== undefined ? truncateForLog(response.data) : undefined,
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
  const dbg = DEBUG ? ' (debug: verbose SDK + request logging)' : '';
  console.log(`Server running on http://localhost:${PORT}${dbg}`);
  if (!DEBUG) {
    console.log('Tip: run with --debug for connection/payload logging on this terminal and in the UI.');
  }
});

