/**
 * Jiva.ai Agent Chat API Client
 * 
 * A simple REST API client for interacting with Jiva.ai workflows.
 */

import {
  ApiConfig,
  ApiResponse,
  SuccessCallback,
  ErrorCallback,
  InitiateConversationRequest,
  InitiateConversationWithContext,
  ConversationMessage,
  ConversationResponse,
  PollRequest,
  PollResponse,
  PollingOptions,
  UploadResponse,
  SocketMessage,
  SocketOptions,
  SocketCallbacks,
} from './types';

const DEFAULT_BASE_URL = 'https://api.jiva.ai/public-api/workflow';
const DEFAULT_SOCKET_BASE_URL = 'https://platform.jiva.ai/api';

/**
 * Builds the full URL for an API endpoint
 * Format: {baseUrl}/{workflowId}/{version}/invoke
 */
function buildUrl(
  baseUrl: string,
  workflowId: string,
  version: string = '0',
  endpoint?: string
): string {
  const url = `${baseUrl}/${workflowId}/${version}/invoke`;
  return endpoint ? `${url}/${endpoint}` : url;
}

/**
 * Makes an HTTP request to the Jiva.ai API
 */
async function makeRequest<T = unknown>(
  config: ApiConfig,
  method: 'GET' | 'POST',
  endpoint: string | undefined,
  payload?: Record<string, unknown>,
  workflowId?: string,
  apiKey?: string,
  version?: string
): Promise<ApiResponse<T>> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const targetWorkflowId = workflowId || config.workflowId;
  const targetApiKey = apiKey || config.apiKey;
  // Determine version - use provided version, or determine from workflow type, or default to "0"
  let targetVersion = version;
  if (!targetVersion) {
    if (workflowId === config.fileUploadCacheWorkflowId) {
      targetVersion = config.fileUploadCacheVersion || config.workflowVersion || '0';
    } else if (workflowId === config.textUploadCacheWorkflowId) {
      targetVersion = config.textUploadCacheVersion || config.workflowVersion || '0';
    } else if (workflowId === config.tableUploadCacheWorkflowId) {
      targetVersion = config.tableUploadCacheVersion || config.workflowVersion || '0';
    } else {
      targetVersion = config.workflowVersion || '0';
    }
  }
  const url = buildUrl(baseUrl, targetWorkflowId, targetVersion, endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': targetApiKey,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (method === 'POST' && payload) {
    options.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(url, options);
    const status = response.status;

    let data: T | undefined;
    let error: string | undefined;

    if (response.ok) {
      try {
        const jsonData = await response.json();
        data = jsonData as T;
        
        // Check for errorMessages in successful responses
        // Note: We don't clear data here because the caller may need to inspect the full response
        // even when errorMessages is present (e.g., to check json.default.state)
        if (data && typeof data === 'object' && 'errorMessages' in data) {
          const errorMessages = (data as { errorMessages: string | null }).errorMessages;
          if (errorMessages && errorMessages !== null) {
            error = errorMessages;
            // Don't clear data - let the caller decide how to handle it
          }
        }
      } catch {
        // If response is not JSON, treat as success with empty data
        data = undefined;
      }
    } else {
      try {
        const errorData = await response.json() as Record<string, unknown>;
        const errorObj = errorData as { error?: string; message?: string; errorMessages?: string | null };
        error = errorObj.error || errorObj.message || 
                (typeof errorObj.errorMessages === 'string' ? errorObj.errorMessages : null) || 
                `HTTP ${status}`;
      } catch {
        error = `HTTP ${status}: ${response.statusText}`;
      }
    }

    return { data, error, status };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Network error';
    return { error: errorMessage, status: 0 };
  }
}

/**
 * Jiva.ai API Client
 */
export class JivaApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    if (!config.workflowId) {
      throw new Error('Workflow ID is required');
    }
    if (!config.fileUploadCacheWorkflowId) {
      throw new Error('File Upload Cache Workflow ID is required');
    }
    if (!config.textUploadCacheWorkflowId) {
      throw new Error('Text Upload Cache Workflow ID is required');
    }
    if (!config.tableUploadCacheWorkflowId) {
      throw new Error('Table Upload Cache Workflow ID is required');
    }
    this.config = config;
  }

  /**
   * Makes a GET request to the API
   * 
   * @param endpoint - Optional endpoint path (appended to base URL)
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the API response
   */
  async get<T = unknown>(
    endpoint?: string,
    onSuccess?: SuccessCallback<T>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<T>> {
    const response = await makeRequest<T>(this.config, 'GET', endpoint);

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data !== undefined) {
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Makes a POST request to the API
   * 
   * @param payload - JSON payload to send
   * @param endpoint - Optional endpoint path (appended to base URL)
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the API response
   */
  async post<T = unknown>(
    payload: Record<string, unknown> = {},
    endpoint?: string,
    onSuccess?: SuccessCallback<T>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<T>> {
    const response = await makeRequest<T>(this.config, 'POST', endpoint, payload);

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data !== undefined || response.status === 200 || response.status === 201) {
      onSuccess?.(response.data as T, response.status);
    }

    return response;
  }

  /**
   * Polls for the status of a running conversation
   * 
   * @param sessionId - The session ID from the original request
   * @param executionId - The ID from the RUNNING response
   * @param options - Polling options
   * @returns Promise with the poll response
   */
  private async pollConversationStatus(
    sessionId: string,
    executionId: string,
    options: PollingOptions = {}
  ): Promise<ApiResponse<PollResponse>> {
    const maxAttempts = options.maxAttempts || 30;
    const pollInterval = options.pollInterval || 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollRequest: PollRequest = {
        sessionId,
        id: executionId,
        mode: 'POLL_REQUEST',
      };

      const payload = {
        data: {
          default: [pollRequest],
        },
      };

      const response = await makeRequest<PollResponse>(
        this.config,
        'POST',
        undefined,
        payload
      );

      if (response.error) {
        return response;
      }

      const state = response.data?.json?.default?.state;
      if (state === 'OK' || state === 'ERROR' || state === 'PARTIAL_OK') {
        return response;
      }

      // If still RUNNING, continue polling
      if (state === 'RUNNING') {
        continue;
      }
    }

    return {
      error: 'Polling timeout: Maximum attempts reached',
      status: 0,
    };
  }

  /**
   * Polls for the status of a running conversation (public method)
   * 
   * @param request - Poll request with sessionId, id, and mode
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the poll response
   */
  async poll(
    request: PollRequest,
    onSuccess?: SuccessCallback<PollResponse>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<PollResponse>> {
    // Validate required fields
    if (!request.sessionId) {
      const error = 'sessionId is required';
      onError?.(error);
      return { error, status: 400 };
    }

    if (!request.id) {
      const error = 'id is required';
      onError?.(error);
      return { error, status: 400 };
    }

    if (request.mode !== 'POLL_REQUEST') {
      const error = 'mode must be POLL_REQUEST';
      onError?.(error);
      return { error, status: 400 };
    }

    // Build the nested payload structure (array must be of size 1)
    const payload = {
      data: {
        default: [request],
      },
    };

    const response = await makeRequest<PollResponse>(
      this.config,
      'POST',
      undefined,
      payload
    );

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data) {
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Validates and normalizes conversation messages
   */
  private validateAndNormalizeMessages(
    request: InitiateConversationRequest | InitiateConversationWithContext
  ): { error?: string; messages?: Array<{ sessionId: string; message: string; mode: string; nodeId?: string; field?: string; assetId?: string }>; sessionId?: string } {
    let messages: Array<{ sessionId: string; message: string; mode: string; nodeId?: string; field?: string; assetId?: string }>;
    let sessionId: string;

    // Handle single message or array of messages
    if (Array.isArray(request)) {
      if (request.length === 0) {
        return { error: 'At least one message is required' };
      }

      messages = request.map((msg) => ({
        sessionId: msg.sessionId,
        message: msg.message,
        mode: msg.mode,
        nodeId: msg.nodeId,
        field: msg.field,
        assetId: msg.assetId,
      }));
      sessionId = request[0].sessionId;

      // Validate all messages have the same sessionId
      for (const msg of request) {
        if (!msg.sessionId) {
          return { error: 'sessionId is required for all messages' };
        }
        if (msg.sessionId !== sessionId) {
          return { error: 'All messages must have the same sessionId' };
        }
        if (!msg.message) {
          return { error: 'message is required for all messages' };
        }
        if (!msg.mode || !['CHAT_REQUEST', 'CHAT_RESPONSE'].includes(msg.mode)) {
          return { error: 'mode must be CHAT_REQUEST or CHAT_RESPONSE for context messages' };
        }
        // Validate screen satisfaction fields: if any are provided, all must be provided
        if (msg.nodeId || msg.field || msg.assetId) {
          if (!msg.nodeId || !msg.field || !msg.assetId) {
            return { error: 'When satisfying a screen, nodeId, field, and assetId must all be provided' };
          }
        }
      }

      // Validate that CHAT_REQUEST and CHAT_RESPONSE alternate
      for (let i = 1; i < messages.length; i++) {
        const previousMode = messages[i - 1].mode;
        const currentMode = messages[i].mode;
        
        if (previousMode === currentMode) {
          return {
            error: `CHAT_REQUEST and CHAT_RESPONSE must alternate. Messages at indices ${i - 1} and ${i} both have mode ${currentMode}`,
          };
        }
      }
    } else {
      // Single message
      if (!request.sessionId) {
        return { error: 'sessionId is required' };
      }
      if (!request.message) {
        return { error: 'message is required' };
      }
      if (!request.mode || !['CHAT_REQUEST', 'CHAT_RESPONSE', 'SCREEN_RESPONSE'].includes(request.mode)) {
        return { error: 'mode must be CHAT_REQUEST, CHAT_RESPONSE, or SCREEN_RESPONSE' };
      }

      sessionId = request.sessionId;
      const messagePayload: { sessionId: string; message: string; mode: string; nodeId?: string; field?: string; assetId?: string } = {
        sessionId: request.sessionId,
        message: request.message,
        mode: request.mode, // Preserve SCREEN_RESPONSE for single messages
        nodeId: request.nodeId,
        field: request.field,
        assetId: request.assetId,
      };
      
      // Validate screen satisfaction fields: if any are provided, all must be provided
      if (request.nodeId || request.field || request.assetId) {
        if (!request.nodeId || !request.field || !request.assetId) {
          return { error: 'When satisfying a screen, nodeId, field, and assetId must all be provided' };
        }
      }
      
      messages = [messagePayload];
    }

    return { messages, sessionId };
  }

  /**
   * Initiates a conversation with the Jiva.ai agent
   * 
   * @param request - Conversation request (single message or array of messages for context)
   * @param options - Optional polling options for RUNNING state
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the conversation response
   */
  async initiateConversation(
    request: InitiateConversationRequest | InitiateConversationWithContext,
    options: PollingOptions = {},
    onSuccess?: SuccessCallback<ConversationResponse>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<ConversationResponse>> {
    // Validate and normalize messages
    const validation = this.validateAndNormalizeMessages(request);
    if (validation.error) {
      onError?.(validation.error);
      return { error: validation.error, status: 400 };
    }

    const messages = validation.messages!;
    const sessionId = validation.sessionId!;

    // Build the nested payload structure
    const payload = {
      data: {
        default: messages,
      },
    };

    // Make the initial request
    const response = await makeRequest<ConversationResponse>(
      this.config,
      'POST',
      undefined,
      payload
    );

    if (response.error) {
      onError?.(response.error, response.status);
      return response;
    }

    // Check if we need to poll for the result
    if (response.data?.json?.default?.state === 'RUNNING' && response.data.json.default.id) {
      const pollResponse = await this.pollConversationStatus(
        sessionId,
        response.data.json.default.id,
        options
      );

      if (pollResponse.error) {
        onError?.(pollResponse.error, pollResponse.status);
        return { error: pollResponse.error, status: pollResponse.status };
      }

      // Convert PollResponse to ConversationResponse format for consistency
      if (pollResponse.data) {
        // Check for errors in poll response
        if (pollResponse.data.json?.default?.state === 'ERROR') {
          const errorMsg = 
            pollResponse.data.json.default.logs?.join('\n') ||
            pollResponse.data.errorMessages ||
            'Request failed';
          onError?.(errorMsg, pollResponse.status);
          return { error: errorMsg, status: pollResponse.status };
        }
        
        const conversationResponse: ConversationResponse = {
          workflowExecutionId: pollResponse.data.workflowExecutionId,
          errorMessages: pollResponse.data.errorMessages,
          data: pollResponse.data.data,
          strings: pollResponse.data.strings,
          base64Files: pollResponse.data.base64Files,
          vectorDatabaseIndexIds: pollResponse.data.vectorDatabaseIndexIds,
          metadata: pollResponse.data.metadata,
          json: {
            default: {
              message: pollResponse.data.json.default.logs?.join('\n') || '',
              state: pollResponse.data.json.default.state,
              mode: 'CHAT_RESPONSE', // Convert POLL_RESPONSE to CHAT_RESPONSE
              executions: pollResponse.data.json.default.executions?.map((exec) => ({
                response: exec.output.response,
                type: exec.output.type,
                data: exec.output.data,
              })),
            },
          },
        };
        onSuccess?.(conversationResponse, pollResponse.status);
        return { data: conversationResponse, status: pollResponse.status };
      }

      return { error: 'No data in poll response', status: pollResponse.status };
    }

    // Immediate response (OK or ERROR)
    if (response.data) {
      if (response.data.json?.default?.state === 'ERROR') {
        // Check for error message in json.default.message first, then errorMessages
        const errorMsg = 
          response.data.json.default.message || 
          response.data.errorMessages || 
          'Request failed';
        onError?.(errorMsg, response.status);
      } else {
        onSuccess?.(response.data, response.status);
      }
    }

    return response;
  }

  /**
   * Uploads a file to the File Upload Cache
   * 
   * @param file - The file to upload (File, Blob, or base64 string)
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the upload response containing the assetId
   */
  async uploadFile(
    file: File | Blob | string,
    onSuccess?: SuccessCallback<UploadResponse>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<UploadResponse>> {
    // Build payload - structure depends on file type
    let base64Content: string;

    if (file instanceof File || file instanceof Blob) {
      // For File/Blob, we need to convert to base64
      base64Content = await this.fileToBase64(file);
    } else {
      // Assume it's already a base64 string
      base64Content = file;
    }

    // File upload cache expects: { "base64FileBytes": { "file": "base64 content" } }
    const payload = {
      base64FileBytes: {
        file: base64Content,
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.fileUploadCacheWorkflowId,
      this.config.fileUploadCacheApiKey || this.config.apiKey
    );

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data) {
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Uploads text to the Text Upload Cache
   * 
   * @param text - The text content to upload
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the upload response containing the assetId
   */
  async uploadText(
    text: string,
    onSuccess?: SuccessCallback<UploadResponse>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<UploadResponse>> {
    if (!text) {
      const error = 'Text content is required';
      onError?.(error);
      return { error, status: 400 };
    }

    const payload = {
      data: {
        default: [
          {
            text: text,
          },
        ],
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.textUploadCacheWorkflowId,
      this.config.textUploadCacheApiKey || this.config.apiKey
    );

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data) {
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Uploads table data to the Table Upload Cache
   * 
   * @param tableData - The table data to upload (array of objects with consistent structure)
   * @param onSuccess - Optional success callback
   * @param onError - Optional error callback
   * @returns Promise with the upload response containing the assetId
   */
  async uploadTable(
    tableData: Record<string, unknown>[],
    onSuccess?: SuccessCallback<UploadResponse>,
    onError?: ErrorCallback
  ): Promise<ApiResponse<UploadResponse>> {
    if (!tableData || tableData.length === 0) {
      const error = 'Table data is required and must not be empty';
      onError?.(error);
      return { error, status: 400 };
    }

    const payload = {
      data: {
        default: [
          {
            table: tableData,
          },
        ],
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.tableUploadCacheWorkflowId,
      this.config.tableUploadCacheApiKey || this.config.apiKey
    );

    if (response.error) {
      onError?.(response.error, response.status);
    } else if (response.data) {
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Helper method to convert File/Blob to base64 string
   */
  private async fileToBase64(file: File | Blob): Promise<string> {
    // Check if FileReader is available (browser environment)
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix if present
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      // Node.js environment - File/Blob should already be base64 or use Buffer
      throw new Error('FileReader is not available. In Node.js, please provide base64 strings directly.');
    }
  }

  /**
   * Creates a WebSocket connection to subscribe to real-time agent updates
   * 
   * @param sessionId - The session ID to subscribe to
   * @param callbacks - Event callbacks for socket events
   * @param options - Socket connection options
   * @returns WebSocket instance
   */
  subscribeToSocket(
    sessionId: string,
    callbacks: SocketCallbacks = {},
    options: SocketOptions = {}
  ): WebSocket {
    if (!sessionId) {
      throw new Error('sessionId is required for socket subscription');
    }

    const socketBaseUrl = this.config.socketBaseUrl || DEFAULT_SOCKET_BASE_URL;
    // Convert https:// to wss:// or http:// to ws://
    const wsProtocol = socketBaseUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const wsBaseUrl = socketBaseUrl.replace(/^https?:\/\//, '');
    // WebSocket URLs don't use /invoke, just the workflow ID and session ID
    const wsUrl = `${wsProtocol}${wsBaseUrl}/workflow-chat/${this.config.workflowId}/${sessionId}`;

    const ws = new WebSocket(wsUrl);

    let reconnectAttempts = 0;
    const maxAttempts = options.maxReconnectAttempts ?? 10;
    const reconnectInterval = options.reconnectInterval ?? 3000;
    const autoReconnect = options.autoReconnect ?? true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const attemptReconnect = () => {
      if (!autoReconnect || reconnectAttempts >= maxAttempts) {
        return;
      }

      reconnectAttempts++;
      callbacks.onReconnect?.(reconnectAttempts);

      reconnectTimeout = setTimeout(() => {
        // Create a new connection by calling the method again
        // Note: This creates a new WebSocket, the old one should be closed
        this.subscribeToSocket(sessionId, callbacks, options);
      }, reconnectInterval);
    };

    ws.onopen = () => {
      reconnectAttempts = 0; // Reset on successful connection
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      callbacks.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const message: SocketMessage = JSON.parse(event.data);
        callbacks.onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse socket message:', error);
      }
    };

    ws.onclose = (event) => {
      callbacks.onClose?.({
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      if (event.code !== 1000) {
        // Not a normal closure, attempt reconnect
        attemptReconnect();
      }
    };

    ws.onerror = (error) => {
      callbacks.onError?.(error);
    };

    return ws;
  }
}

