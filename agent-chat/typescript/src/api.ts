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
  PollResponseData,
  PollExecution,
  PollingOptions,
  UploadResponse,
  SocketMessage,
  SocketOptions,
  SocketCallbacks,
  Logger,
} from './types';
import { createLogger } from './logger';

const DEFAULT_BASE_URL = 'https://api.jiva.ai/public-api/workflow';
const DEFAULT_SOCKET_BASE_URL = 'https://api.jiva.ai/public-api';

// Cache EventSource class for Node.js to avoid requiring it during reconnection
// (which can happen after Jest environment teardown)
let cachedEventSourceClass: typeof EventSource | null = null;

/**
 * Clears the cached EventSource class (useful for testing)
 * @internal
 */
export function clearEventSourceCache(): void {
  cachedEventSourceClass = null;
}

/**
 * Gets the EventSource class, using native EventSource in browsers or eventsource package in Node.js
 */
function getEventSourceClass(): typeof EventSource {
  // Return cached version if available
  if (cachedEventSourceClass) {
    return cachedEventSourceClass;
  }

  // Browser environment - use native EventSource
  if (typeof EventSource !== 'undefined') {
    cachedEventSourceClass = EventSource;
    return cachedEventSourceClass;
  }

  // Node.js environment - use eventsource package
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    // @ts-ignore - require is available in Node.js
    const eventsource = require('eventsource');
    // eventsource package exports EventSource as the default export or as a named export
    const EventSourceClass = eventsource.EventSource || eventsource.default || eventsource;
    if (typeof EventSourceClass !== 'function') {
      throw new Error('eventsource package did not export a constructor');
    }
    cachedEventSourceClass = EventSourceClass as typeof EventSource;
    return cachedEventSourceClass;
  } catch (error) {
    throw new Error(
      'EventSource is not available. In Node.js, please install the "eventsource" package: npm install eventsource'
    );
  }
}

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
  version?: string,
  logger?: Logger
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

  logger?.debug(`Making ${method} request`, {
    url,
    workflowId: targetWorkflowId,
    version: targetVersion,
    hasPayload: !!payload,
    payloadSize: payload ? JSON.stringify(payload).length : 0,
  });

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
            logger?.warn('API returned errorMessages in successful response', {
              status,
              errorMessages,
            });
            // Don't clear data - let the caller decide how to handle it
          }
        }

        if (error) {
          logger?.error('Request completed with error', {
            url,
            status,
            error,
          });
        } else {
          logger?.debug('Request completed successfully', {
            url,
            status,
            hasData: !!data,
          });
        }
      } catch (parseError) {
        // If response is not JSON, treat as success with empty data
        logger?.warn('Response is not valid JSON, treating as success', {
          url,
          status,
        });
        data = undefined;
      }
    } else {
      try {
        const errorData = await response.json() as Record<string, unknown>;
        const errorObj = errorData as { error?: string; message?: string; errorMessages?: string | null };
        error = errorObj.error || errorObj.message || 
                (typeof errorObj.errorMessages === 'string' ? errorObj.errorMessages : null) || 
                `HTTP ${status}`;
        logger?.error('Request failed', {
          url,
          status,
          error,
          errorData,
        });
      } catch {
        error = `HTTP ${status}: ${response.statusText}`;
        logger?.error('Request failed and response is not JSON', {
          url,
          status,
          statusText: response.statusText,
        });
      }
    }

    return { data, error, status };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Network error';
    logger?.error('Network error during request', {
      url,
      error: errorMessage,
      originalError: err,
    });
    return { error: errorMessage, status: 0 };
  }
}

/**
 * Jiva.ai API Client
 */
export class JivaApiClient {
  private config: ApiConfig;
  // Track reconnect attempts per sessionId to persist across recursive calls
  private reconnectAttemptsMap = new Map<string, number>();
  // Track if a reconnect is already scheduled for a sessionId
  private reconnectScheduledMap = new Map<string, boolean>();;
  private logger: Logger;

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
    this.logger = createLogger(config.logging);
    this.logger.debug('JivaApiClient initialized', {
      workflowId: config.workflowId,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    });
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
    this.logger.debug('Making GET request', { endpoint });
    const response = await makeRequest<T>(this.config, 'GET', endpoint, undefined, undefined, undefined, undefined, this.logger);

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
    this.logger.debug('Making POST request', { endpoint, hasPayload: !!payload });
    const response = await makeRequest<T>(this.config, 'POST', endpoint, payload, undefined, undefined, undefined, this.logger);

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

      this.logger.debug('Polling conversation status', {
        sessionId,
        executionId,
        attempt: attempt + 1,
        maxAttempts,
      });
      const response = await makeRequest<PollResponse>(
        this.config,
        'POST',
        undefined,
        payload,
        undefined,
        undefined,
        undefined,
        this.logger
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
        this.logger.debug('Poll response still RUNNING, continuing', {
          sessionId,
          executionId,
          attempt: attempt + 1,
        });
        continue;
      }
    }

    this.logger.warn('Polling timeout reached', {
      sessionId,
      executionId,
      maxAttempts,
    });
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

    this.logger.debug('Making poll request', {
      sessionId: request.sessionId,
      id: request.id,
    });
    const response = await makeRequest<PollResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      undefined,
      undefined,
      undefined,
      this.logger
    );

    if (response.error) {
      this.logger.error('Poll request failed', {
        sessionId: request.sessionId,
        id: request.id,
        error: response.error,
      });
      onError?.(response.error, response.status);
    } else if (response.data) {
      this.logger.debug('Poll request successful', {
        sessionId: request.sessionId,
        id: request.id,
        state: response.data.json?.default?.state,
      });
      onSuccess?.(response.data, response.status);
    }

    return response;
  }

  /**
   * Checks if all executions in a poll response are complete (not PENDING)
   * 
   * Handles both response formats:
   * - json.default.data[0].executions (array format with data property)
   * - json.default.executions (direct format)
   * 
   * @param pollResponse - The poll response to check
   * @returns true if all executions are complete (not PENDING), false otherwise
   */
  checkCompletionStatus(pollResponse: PollResponse): boolean {
    if (!pollResponse.json?.default) {
      return false;
    }

    this.logger.debug('Checking completion status', {
      pollResponse,
    });

    const responseData = pollResponse.json.default as PollResponseData & { data?: Array<{ executions?: Array<{ state?: string }> }> };
    
    // Check if there's a data array (newer format: json.default.data[0].executions)
    if (responseData.data && Array.isArray(responseData.data) && responseData.data.length > 0) {
      const firstDataItem = responseData.data[0];
      if (firstDataItem.executions && Array.isArray(firstDataItem.executions)) {
        // Check if all executions are not PENDING
        const allComplete = firstDataItem.executions.every(
          (exec: { state?: string }) => exec.state !== 'PENDING'
        );
        this.logger.debug('Completion check (data array format)', {
          totalExecutions: firstDataItem.executions.length,
          allComplete,
          states: firstDataItem.executions.map((e: { state?: string }) => e.state),
        });
        return allComplete;
      }
    }
    
    // Fallback to direct executions array (older format: json.default.executions)
    if (responseData.executions && Array.isArray(responseData.executions)) {
      // Check if all executions are not PENDING
      const allComplete = responseData.executions.every(
        (exec: PollExecution) => exec.state !== 'PENDING'
      );
      this.logger.debug('Completion check (direct format)', {
        totalExecutions: responseData.executions.length,
        allComplete,
        states: responseData.executions.map((e: PollExecution) => e.state),
      });
      return allComplete;
    }

    // If no executions array, consider it complete
    this.logger.debug('Completion check: no executions found, considering complete');
    return true;
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
    this.logger.info('Initiating conversation', {
      sessionId,
      messageCount: messages.length,
      isContext: Array.isArray(request),
    });
    this.logger.debug('Conversation payload', {
      sessionId,
      messages: messages.map(m => ({ mode: m.mode, hasMessage: !!m.message })),
    });
    const response = await makeRequest<ConversationResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      undefined,
      undefined,
      undefined,
      this.logger
    );

    if (response.error) {
      onError?.(response.error, response.status);
      return response;
    }

    // Check if we need to poll for the result
    if (response.data?.json?.default?.state === 'RUNNING' && response.data.json.default.id) {
      this.logger.info('Conversation state is RUNNING, starting polling', {
        sessionId,
        executionId: response.data.json.default.id,
      });
      const pollResponse = await this.pollConversationStatus(
        sessionId,
        response.data.json.default.id,
        options
      );

      if (pollResponse.error) {
        this.logger.error('Polling failed', {
          sessionId,
          executionId: response.data.json.default.id,
          error: pollResponse.error,
        });
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
          this.logger.error('Poll response indicates ERROR state', {
            sessionId,
            executionId: response.data.json.default.id,
            errorMsg,
          });
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
        this.logger.info('Polling completed successfully', {
          sessionId,
          executionId: response.data.json.default.id,
          state: conversationResponse.json.default.state,
        });
        onSuccess?.(conversationResponse, pollResponse.status);
        return { data: conversationResponse, status: pollResponse.status };
      }

      this.logger.warn('Poll response has no data', {
        sessionId,
        executionId: response.data.json.default.id,
      });
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
        this.logger.error('Conversation response indicates ERROR state', {
          sessionId,
          errorMsg,
          state: response.data.json.default.state,
        });
        onError?.(errorMsg, response.status);
      } else {
        this.logger.info('Conversation completed immediately', {
          sessionId,
          state: response.data.json.default.state,
          mode: response.data.json.default.mode,
        });
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
    this.logger.info('Uploading file', {
      fileType: file instanceof File ? 'File' : file instanceof Blob ? 'Blob' : 'base64',
    });
    // Build payload - structure depends on file type
    let base64Content: string;

    if (file instanceof File || file instanceof Blob) {
      // For File/Blob, we need to convert to base64
      this.logger.debug('Converting File/Blob to base64');
      base64Content = await this.fileToBase64(file);
      this.logger.debug('File converted to base64', {
        size: base64Content.length,
      });
    } else {
      // Assume it's already a base64 string
      this.logger.debug('Using provided base64 string', {
        size: file.length,
      });
      base64Content = file;
    }

    // File upload cache expects: { "base64FileBytes": { "default": "base64 content" } }
    // The Spring backend expects the key to be "default" (or a configured key from the workflow node)
    const payload = {
      base64FileBytes: {
        default: base64Content,
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.fileUploadCacheWorkflowId,
      this.config.fileUploadCacheApiKey || this.config.apiKey,
      this.config.fileUploadCacheVersion || this.config.workflowVersion || '0',
      this.logger
    );

    if (response.error) {
      this.logger.error('File upload failed', {
        error: response.error,
        status: response.status,
      });
      onError?.(response.error, response.status);
    } else if (response.data?.strings?.default) {
      this.logger.info('File upload successful', {
        assetId: response.data.strings.default,
      });
      onSuccess?.(response.data, response.status);
    } else {
      const error = 'No assetId in upload response';
      this.logger.error('File upload response missing assetId', {
        response: response.data,
      });
      onError?.(error);
      return { error, status: response.status };
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
      this.logger.warn('uploadText called with empty text');
      onError?.(error);
      return { error, status: 400 };
    }

    this.logger.info('Uploading text', {
      textLength: text.length,
    });

    // Text upload cache expects: { "strings": { "default": "text content" } }
    // The Spring backend expects strings to be a Map<String, String> where the key is "default" (or configured)
    const payload = {
      strings: {
        default: text,
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.textUploadCacheWorkflowId,
      this.config.textUploadCacheApiKey || this.config.apiKey,
      this.config.textUploadCacheVersion || this.config.workflowVersion || '0',
      this.logger
    );

    if (response.error) {
      this.logger.error('Text upload failed', {
        error: response.error,
        status: response.status,
      });
      onError?.(response.error, response.status);
    } else if (response.data?.strings?.default) {
      this.logger.info('Text upload successful', {
        assetId: response.data.strings.default,
      });
      onSuccess?.(response.data, response.status);
    } else {
      const error = 'No assetId in upload response';
      this.logger.error('Text upload response missing assetId', {
        response: response.data,
      });
      onError?.(error);
      return { error, status: response.status };
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
      this.logger.warn('uploadTable called with empty table data');
      onError?.(error);
      return { error, status: 400 };
    }

    this.logger.info('Uploading table', {
      rowCount: tableData.length,
    });

    // Table upload cache expects: { "data": { "default": [array of row objects] } }
    // The Spring backend expects data to be a Map<String, List<Map<String, Object>>>
    // where the key is "default" (or configured) and the value is the table data directly
    const payload = {
      data: {
        default: tableData,
      },
    };

    const response = await makeRequest<UploadResponse>(
      this.config,
      'POST',
      undefined,
      payload,
      this.config.tableUploadCacheWorkflowId,
      this.config.tableUploadCacheApiKey || this.config.apiKey,
      this.config.tableUploadCacheVersion || this.config.workflowVersion || '0',
      this.logger
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
   * Creates a Server-Sent Events (SSE) connection to subscribe to real-time agent updates
   * Uses POST request to initiate the connection, then streams SSE events.
   * 
   * The backend Spring implementation sends an initial "connected" event when the connection is established,
   * followed by streaming agent update messages.
   * 
   * @param sessionId - The session ID to subscribe to
   * @param callbacks - Event callbacks for socket events
   * @param options - Socket connection options
   * @returns An object that mimics EventSource interface for compatibility
   */
  subscribeToSocket(
    sessionId: string,
    callbacks: SocketCallbacks = {},
    options: SocketOptions = {}
  ): { url: string; close: () => void; readyState: number } {
    if (!sessionId) {
      throw new Error('sessionId is required for socket subscription');
    }

    // For sockets, use socketBaseUrl if provided, otherwise derive from baseUrl, or use default
    let socketBaseUrl: string;
    if (this.config.socketBaseUrl) {
      socketBaseUrl = this.config.socketBaseUrl;
    } else {
      const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
      // Derive socket base URL by removing /workflow from the end
      socketBaseUrl = baseUrl.replace(/\/workflow\/?$/, '') || DEFAULT_SOCKET_BASE_URL;
    }
    // Construct URL: POST https://{SOCKET_BASE_URL}/workflow-chat/{workflowId}/{sessionId}
    const url = `${socketBaseUrl}/workflow-chat/${this.config.workflowId}/${sessionId}`;

    this.logger.info('Creating SSE connection via POST', {
      sessionId,
      url,
      workflowId: this.config.workflowId,
      socketBaseUrl,
      autoReconnect: options.autoReconnect ?? true,
    });

    // Create a controller to manage the connection
    let abortController: AbortController | null = null;
    let isClosed = false;
    const CONNECTING = 0;
    const OPEN = 1;
    const CLOSED = 2;
    let readyState = CONNECTING;

    // Get or initialize reconnect attempts for this sessionId
    const reconnectAttempts = this.reconnectAttemptsMap.get(sessionId) ?? 0;
    const maxAttempts = options.maxReconnectAttempts ?? 10;
    const reconnectInterval = options.reconnectInterval ?? 3000;
    const autoReconnect = options.autoReconnect ?? true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isConnected = false;
    let isReconnecting = false;

    const attemptReconnect = () => {
      // Prevent multiple simultaneous reconnect attempts
      if (isReconnecting || this.reconnectScheduledMap.get(sessionId)) {
        this.logger.debug('Reconnect already in progress, skipping', { sessionId });
        return;
      }

      if (!autoReconnect || reconnectAttempts >= maxAttempts) {
        this.logger.warn('Max reconnection attempts reached or autoReconnect disabled', {
          sessionId,
          reconnectAttempts,
          maxAttempts,
        });
        // Clean up tracking
        this.reconnectAttemptsMap.delete(sessionId);
        this.reconnectScheduledMap.delete(sessionId);
        return;
      }

      // Mark that we're scheduling a reconnect
      this.reconnectScheduledMap.set(sessionId, true);
      isReconnecting = true;

      // Increment and store reconnect attempts
      const newAttemptCount = reconnectAttempts + 1;
      this.reconnectAttemptsMap.set(sessionId, newAttemptCount);

      this.logger.info('Scheduling SSE reconnection', {
        sessionId,
        attempt: newAttemptCount,
        maxAttempts,
        delayMs: reconnectInterval,
      });
      callbacks.onReconnect?.(newAttemptCount);

      reconnectTimeout = setTimeout(() => {
        // Clear the scheduled flag before attempting reconnect
        this.reconnectScheduledMap.delete(sessionId);
        isReconnecting = false;
        
        // Close the old connection before creating a new one
        if (abortController) {
          abortController.abort();
        }
        // Create a new connection (will use the updated reconnectAttempts from the map)
        this.subscribeToSocket(sessionId, callbacks, options);
      }, reconnectInterval);
    };

    const startConnection = async () => {
      abortController = new AbortController();
      readyState = CONNECTING;
      isClosed = false;

      try {
        // Prepare headers with API key
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey,
          'Accept': 'text/event-stream',
        };

        this.logger.debug('SSE connection details', {
          url,
          method: 'POST',
          hasApiKey: !!this.config.apiKey,
          apiKeyLength: this.config.apiKey?.length || 0,
          apiKeyPrefix: this.config.apiKey?.substring(0, 10) || 'N/A',
          headers: Object.keys(headers),
        });

        // Make POST request to initiate SSE stream
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({}), // Empty body for POST
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorDetails: Record<string, unknown> = {
            sessionId,
            status: response.status,
            statusText: response.statusText,
          };
          this.logger.error('SSE connection failed', errorDetails);
          callbacks.onError?.(new Error(`HTTP ${response.status}: ${response.statusText}`));
          if (!isConnected && !isReconnecting) {
            attemptReconnect();
          }
          return;
        }

        // Connection established
        readyState = OPEN;
        isConnected = true;
        isReconnecting = false;
        this.reconnectAttemptsMap.delete(sessionId);
        this.reconnectScheduledMap.delete(sessionId);
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        callbacks.onOpen?.();

        // Parse SSE stream manually
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Stream ended
            readyState = CLOSED;
            isConnected = false;
            this.logger.info('SSE connection closed', { sessionId });
            callbacks.onClose?.({
              code: 0,
              reason: 'Stream ended',
              wasClean: true,
            });
            attemptReconnect();
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (lines ending with \n\n)
          let eventEndIndex: number;
          while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
            const eventText = buffer.substring(0, eventEndIndex);
            buffer = buffer.substring(eventEndIndex + 2);

            // Parse SSE format: "event: <name>\ndata: <data>"
            let eventName = 'message';
            let eventData = '';

            for (const line of eventText.split('\n')) {
              if (line.startsWith('event:')) {
                eventName = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                eventData = line.substring(5).trim();
              }
            }

            // Handle "connected" event
            if (eventName === 'connected') {
              this.logger.info('SSE connection confirmed by server', {
                sessionId,
                connectionMessage: eventData,
              });
              // onOpen already called, but we can log this
            } else if (eventData) {
              // Handle regular messages
              try {
                // Skip connection confirmation messages
                if (eventData.startsWith('Connected to topic:')) {
                  this.logger.debug('Received connection confirmation', {
                    sessionId,
                    data: eventData,
                  });
                  continue;
                }

                const message: SocketMessage = JSON.parse(eventData);
                this.logger.debug('SSE message received', {
                  sessionId,
                  messageTypes: message.types,
                  hasMessage: !!message.message,
                  workflowId: message.workflowId,
                });
                callbacks.onMessage?.(message);
              } catch (error) {
                // If parsing fails, it might be a non-JSON message
                this.logger.debug('SSE message is not JSON', {
                  sessionId,
                  rawData: eventData,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }
          }
        }
      } catch (error) {
        if (abortController?.signal.aborted) {
          // Connection was intentionally closed
          readyState = CLOSED;
          return;
        }

        // Connection error
        readyState = CLOSED;
        isConnected = false;
        
        const errorDetails: Record<string, unknown> = {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        const isReconnectScheduled = this.reconnectScheduledMap.get(sessionId) ?? false;
        const currentAttempts = this.reconnectAttemptsMap.get(sessionId) ?? 0;

        if (!isReconnectScheduled && currentAttempts < maxAttempts) {
          this.logger.error('SSE connection failed', errorDetails);
        } else if (currentAttempts >= maxAttempts) {
          if (!isReconnectScheduled) {
            this.logger.error('SSE connection failed (max attempts reached)', {
              ...errorDetails,
              attempts: currentAttempts,
              maxAttempts,
            });
          }
        }

        callbacks.onError?.(error);
        if (!isConnected && !isReconnectScheduled) {
          attemptReconnect();
        }
      }
    };

    // Start the connection asynchronously
    startConnection();

    // Return an object that mimics EventSource interface
    const connectionObject = {
      url,
      readyState,
      close: () => {
        isClosed = true;
        readyState = CLOSED;
        if (abortController) {
          abortController.abort();
        }
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        this.reconnectAttemptsMap.delete(sessionId);
        this.reconnectScheduledMap.delete(sessionId);
        this.logger.info('SSE connection closed by client', { sessionId });
      },
    };

    // Make readyState accessible and updatable
    Object.defineProperty(connectionObject, 'readyState', {
      get: () => readyState,
      enumerable: true,
      configurable: true,
    });

    return connectionObject;
  }
}

