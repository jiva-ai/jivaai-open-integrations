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
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Store client instances per session (in production, use proper session management)
const clients = new Map();

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
    const { message, sessionId, settings } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    if (!settings) {
      return res.status(400).json({ error: 'settings are required' });
    }

    const client = getClient(settings);

    // Initiate conversation
    const response = await client.initiateConversation({
      sessionId,
      message,
      mode: 'CHAT_REQUEST',
    });

    if (response.error) {
      return res.status(response.status || 500).json({ error: response.error });
    }

    // If response has RUNNING state with an ID, poll until all executions are complete
    if (response.data?.json?.default?.state === 'RUNNING' && response.data.json.default.id) {
      const executionId = response.data.json.default.id;
      const maxPollAttempts = 100; // Maximum number of polling attempts
      const pollInterval = 5000; // 5 seconds
      let pollAttempts = 0;
      let lastPollResponse = response.data;

      while (pollAttempts < maxPollAttempts) {
        // Wait before polling
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        // Poll for status
        const pollResponse = await client.poll({
          sessionId,
          id: executionId,
          mode: 'POLL_REQUEST',
        });

        if (pollResponse.error) {
          return res.status(pollResponse.status || 500).json({ error: pollResponse.error });
        }

        if (pollResponse.data) {
          lastPollResponse = pollResponse.data;

          // Check if all executions are complete
          if (client.checkCompletionStatus(pollResponse.data)) {
            // All executions are complete, return the final response
            return res.json(pollResponse.data);
          }

          // Check if the overall state is ERROR
          if (pollResponse.data.json?.default?.state === 'ERROR') {
            return res.json(pollResponse.data);
          }
        }

        pollAttempts++;
      }

      // If we've exhausted polling attempts, return the last response
      return res.json(lastPollResponse);
    }

    // Immediate response (OK or ERROR)
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

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

