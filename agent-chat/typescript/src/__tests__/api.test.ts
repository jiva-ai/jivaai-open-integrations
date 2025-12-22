/**
 * Tests for the Jiva.ai API Client
 */

import { JivaApiClient } from '../api';
import { ApiConfig, ConversationResponse, PollResponse, UploadResponse, SocketMessage } from '../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('JivaApiClient', () => {
  const mockConfig: ApiConfig = {
    apiKey: 'test-api-key',
    workflowId: 'test-workflow-id',
    fileUploadCacheWorkflowId: 'file-cache-workflow-id',
    fileUploadCacheApiKey: 'file-cache-api-key',
    textUploadCacheWorkflowId: 'text-cache-workflow-id',
    textUploadCacheApiKey: 'text-cache-api-key',
    tableUploadCacheWorkflowId: 'table-cache-workflow-id',
    tableUploadCacheApiKey: 'table-cache-api-key',
    logging: {
      level: 'warn',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure fetch is always mocked and reset
    (global.fetch as jest.Mock).mockReset();
    // Set a default mock that rejects to catch any unmocked calls
    // This will be overridden by mockResolvedValueOnce/mockRejectedValueOnce in individual tests
    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('Unmocked fetch call detected. All fetch calls must be mocked using mockResolvedValueOnce or mockRejectedValueOnce in tests.')
    );
  });

  describe('constructor', () => {
    it('should create a client with valid config', () => {
      const client = new JivaApiClient(mockConfig);
      expect(client).toBeInstanceOf(JivaApiClient);
    });

    it('should throw error if apiKey is missing', () => {
      expect(() => {
        new JivaApiClient({ workflowId: 'test-id' } as ApiConfig);
      }).toThrow('API key is required');
    });

    it('should throw error if workflowId is missing', () => {
      expect(() => {
        new JivaApiClient({ apiKey: 'test-key' } as ApiConfig);
      }).toThrow('Workflow ID is required');
    });

    it('should throw error if fileUploadCacheWorkflowId is missing', () => {
      expect(() => {
        new JivaApiClient({
          apiKey: 'test-key',
          workflowId: 'test-workflow-id',
        } as ApiConfig);
      }).toThrow('File Upload Cache Workflow ID is required');
    });

    it('should throw error if textUploadCacheWorkflowId is missing', () => {
      expect(() => {
        new JivaApiClient({
          apiKey: 'test-key',
          workflowId: 'test-workflow-id',
          fileUploadCacheWorkflowId: 'file-cache-id',
        } as ApiConfig);
      }).toThrow('Text Upload Cache Workflow ID is required');
    });

    it('should throw error if tableUploadCacheWorkflowId is missing', () => {
      expect(() => {
        new JivaApiClient({
          apiKey: 'test-key',
          workflowId: 'test-workflow-id',
          fileUploadCacheWorkflowId: 'file-cache-id',
          textUploadCacheWorkflowId: 'text-cache-id',
        } as ApiConfig);
      }).toThrow('Table Upload Cache Workflow ID is required');
    });

    it('should use default apiKey when upload cache API keys are not provided', async () => {
      const configWithoutCacheKeys: ApiConfig = {
        apiKey: 'default-api-key',
        workflowId: 'test-workflow-id',
        fileUploadCacheWorkflowId: 'file-cache-workflow-id',
        textUploadCacheWorkflowId: 'text-cache-workflow-id',
        tableUploadCacheWorkflowId: 'table-cache-workflow-id',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          workflowExecutionId: 'exec-123',
          errorMessages: null,
          data: {},
          strings: { default: 'asset-id' },
          base64Files: {},
          vectorDatabaseIndexIds: {},
          metadata: {},
          json: {},
        }),
      });

      const client = new JivaApiClient(configWithoutCacheKeys);
      await client.uploadFile('base64-content');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-key': 'default-api-key',
          }),
        })
      );
    });
  });

  describe('get', () => {
    it('should make a GET request with correct headers and URL', async () => {
      const mockResponse = { data: { message: 'success' } };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse.data,
      });

      const client = new JivaApiClient(mockConfig);
      await client.get();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'api-key': 'test-api-key',
          },
        })
      );
    });

    it('should use custom baseUrl when provided', async () => {
      const customConfig = { ...mockConfig, baseUrl: 'https://test-api.example.com/workflow' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const client = new JivaApiClient(customConfig);
      await client.get();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/workflow/test-workflow-id/0/invoke',
        expect.any(Object)
      );
    });

    it('should append endpoint to URL when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const client = new JivaApiClient(mockConfig);
      await client.get('messages');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke/messages',
        expect.any(Object)
      );
    });

    it('should call success callback on successful request', async () => {
      const mockData = { message: 'success' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      await client.get(undefined, onSuccess);

      expect(onSuccess).toHaveBeenCalledWith(mockData, 200);
    });

    it('should call error callback on failed request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not found' }),
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      await client.get(undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith('Not found', 404);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.get(undefined, undefined, onError);

      expect(response.error).toBe('Network error');
      expect(response.status).toBe(0);
      expect(onError).toHaveBeenCalledWith('Network error', 0);
    });
  });

  describe('post', () => {
    it('should make a POST request with correct headers, URL, and payload', async () => {
      const payload = { message: 'hello' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const client = new JivaApiClient(mockConfig);
      await client.post(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': 'test-api-key',
          },
          body: JSON.stringify(payload),
        })
      );
    });

    it('should use empty object as default payload', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const client = new JivaApiClient(mockConfig);
      await client.post();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      );
    });

    it('should append endpoint to URL when provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({}),
      });

      const client = new JivaApiClient(mockConfig);
      await client.post({}, 'send');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke/send',
        expect.any(Object)
      );
    });

    it('should call success callback on successful request', async () => {
      const mockData = { id: '123' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockData,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      await client.post({}, undefined, onSuccess);

      expect(onSuccess).toHaveBeenCalledWith(mockData, 201);
    });

    it('should call error callback on failed request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid payload' }),
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      await client.post({}, undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith('Invalid payload', 400);
    });
  });

  describe('initiateConversation', () => {
    const mockConversationResponse: ConversationResponse = {
      workflowExecutionId: 'exec-123',
      errorMessages: null,
      data: {},
      strings: {},
      base64Files: {},
      vectorDatabaseIndexIds: {},
      metadata: {},
      json: {
        default: {
          message: 'Request processed',
          state: 'OK',
          mode: 'CHAT_RESPONSE',
          executions: [
            {
              response: 'Execution completed',
              type: 'text',
            },
          ],
        },
      },
    };

    it('should validate sessionId is required', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.initiateConversation(
        {
          sessionId: '',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        {},
        undefined,
        onError
      );

      expect(response.error).toBe('sessionId is required');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalledWith('sessionId is required');
    });

    it('should validate message is required', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: '',
          mode: 'CHAT_REQUEST',
        },
        {},
        undefined,
        onError
      );

      expect(response.error).toBe('message is required');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalledWith('message is required');
    });

    it('should validate mode is valid', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'INVALID_MODE' as any,
        },
        {},
        undefined,
        onError
      );

      expect(response.error).toContain('mode must be');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalled();
    });

    it('should send correct payload structure for CHAT_REQUEST', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConversationResponse,
      });

      const client = new JivaApiClient(mockConfig);
      await client.initiateConversation({
        sessionId: 'user-123-thread-1',
        message: 'create a professional RFQ document',
        mode: 'CHAT_REQUEST',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              default: [
                {
                  sessionId: 'user-123-thread-1',
                  message: 'create a professional RFQ document',
                  mode: 'CHAT_REQUEST',
                },
              ],
            },
          }),
        })
      );
    });

    it('should handle immediate OK response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConversationResponse,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        {},
        onSuccess
      );

      expect(response.data).toEqual(mockConversationResponse);
      expect(onSuccess).toHaveBeenCalledWith(mockConversationResponse, 200);
    });

    it('should handle ERROR state response with errorMessages', async () => {
      const errorResponse: ConversationResponse = {
        ...mockConversationResponse,
        errorMessages: 'Something went wrong',
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'ERROR',
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorResponse,
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        {},
        undefined,
        onError
      );

      expect(response.data).toEqual(errorResponse);
      expect(onError).toHaveBeenCalledWith('Something went wrong', 200);
    });

    it('should handle ERROR state response with json.default.message', async () => {
      const errorResponse: ConversationResponse = {
        ...mockConversationResponse,
        errorMessages: null,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'ERROR',
            message: 'Error occurred during processing',
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorResponse,
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        {},
        undefined,
        onError
      );

      expect(response.data).toEqual(errorResponse);
      expect(onError).toHaveBeenCalledWith('Error occurred during processing', 200);
    });

    it('should prioritize errorMessages over json.default.message when both present', async () => {
      const errorResponse: ConversationResponse = {
        ...mockConversationResponse,
        errorMessages: 'Generic error message',
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'ERROR',
            message: 'Specific error message from json',
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorResponse,
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        {},
        undefined,
        onError
      );

      expect(response.data).toEqual(errorResponse);
      expect(onError).toHaveBeenCalledWith('Generic error message', 200);
    });

    it('should handle errorMessages in successful HTTP response', async () => {
      const errorResponse = {
        errorMessages: 'API returned an error message',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorResponse,
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.post(errorResponse, undefined, undefined, onError);

      expect(response.error).toBe('API returned an error message');
      expect(onError).toHaveBeenCalledWith('API returned an error message', 200);
    });

    it('should ignore errorMessages when null', async () => {
      const responseWithNullError = {
        errorMessages: null,
        data: { result: 'success' },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseWithNullError,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.post({}, undefined, onSuccess);

      expect(response.data).toEqual(responseWithNullError);
      expect(response.error).toBeUndefined();
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should poll for RUNNING state and return final result', async () => {
      const runningResponse: ConversationResponse = {
        ...mockConversationResponse,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'RUNNING',
            id: 'exec-456',
          },
        },
      };

      const pollResponse: PollResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            state: 'OK',
            mode: 'POLL_RESPONSE',
            logs: ['Processing complete'],
            executions: [
              {
                startTime: 1234567890,
                state: 'OK',
                output: {
                  response: 'Execution completed',
                  type: 'text',
                },
              },
            ],
          },
        },
      };

      // Mock initial RUNNING response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningResponse,
      });

      // Mock polling response (OK)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => pollResponse,
      });

      // Mock setTimeout to speed up test
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const promise = client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        { maxAttempts: 5, pollInterval: 100 },
        onSuccess
      );

      // Fast-forward timers and flush promises
      jest.advanceTimersByTime(100);
      await jest.runAllTimersAsync();

      const response = await promise;
      
      jest.useRealTimers();

      expect(response.data).toBeDefined();
      expect(onSuccess).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              default: [
                {
                  sessionId: 'session-123',
                  id: 'exec-456',
                  mode: 'POLL_REQUEST',
                },
              ],
            },
          }),
        })
      );

      jest.useRealTimers();
      setTimeoutSpy.mockRestore();
    });

    it('should handle polling timeout', async () => {
      const runningResponse: ConversationResponse = {
        ...mockConversationResponse,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'RUNNING',
            id: 'exec-456',
          },
        },
      };

      const runningPollResponse: PollResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            state: 'RUNNING',
            mode: 'POLL_RESPONSE',
            logs: ['Still processing...'],
          },
        },
      };

      // Mock initial RUNNING response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningResponse,
      });

      // Mock multiple RUNNING responses (timeout scenario)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => runningPollResponse,
      });

      jest.useFakeTimers();

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const promise = client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        { maxAttempts: 2, pollInterval: 100 },
        undefined,
        onError
      );

      // Fast-forward through all polling attempts and flush promises
      jest.advanceTimersByTime(200);
      await jest.runAllTimersAsync();

      const response = await promise;

      expect(response.error).toContain('Polling timeout');
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Polling timeout'), 0);

      jest.useRealTimers();
    });

    it('should handle network error during polling', async () => {
      const runningResponse: ConversationResponse = {
        ...mockConversationResponse,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'RUNNING',
            id: 'exec-456',
          },
        },
      };

      // Mock initial RUNNING response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningResponse,
      });

      // Mock network error during polling (second call)
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      jest.useFakeTimers();

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const promise = client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        { maxAttempts: 5, pollInterval: 100 },
        undefined,
        onError
      );

      jest.advanceTimersByTime(100);
      await jest.runAllTimersAsync();

      const response = await promise;

      expect(response.error).toBe('Network error');
      expect(onError).toHaveBeenCalledWith('Network error', 0);

      jest.useRealTimers();
    });

    describe('context support', () => {
      it('should send multiple messages with context', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockConversationResponse,
        });

        const client = new JivaApiClient(mockConfig);
        await client.initiateConversation([
          {
            sessionId: 'session-123',
            message: 'RFQs are generally single-pagers',
            mode: 'CHAT_REQUEST',
          },
          {
            sessionId: 'session-123',
            message: 'ok',
            mode: 'CHAT_RESPONSE',
          },
          {
            sessionId: 'session-123',
            message: 'create a professional RFQ document',
            mode: 'CHAT_REQUEST',
          },
        ]);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              data: {
                default: [
                  {
                    sessionId: 'session-123',
                    message: 'RFQs are generally single-pagers',
                    mode: 'CHAT_REQUEST',
                  },
                  {
                    sessionId: 'session-123',
                    message: 'ok',
                    mode: 'CHAT_RESPONSE',
                  },
                  {
                    sessionId: 'session-123',
                    message: 'create a professional RFQ document',
                    mode: 'CHAT_REQUEST',
                  },
                ],
              },
            }),
          })
        );
      });

      it('should validate that messages alternate CHAT_REQUEST and CHAT_RESPONSE', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'first message',
              mode: 'CHAT_REQUEST',
            },
            {
              sessionId: 'session-123',
              message: 'second message',
              mode: 'CHAT_REQUEST', // Should be CHAT_RESPONSE
            },
          ],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('must alternate');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should validate that all messages have the same sessionId', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'first message',
              mode: 'CHAT_REQUEST',
            },
            {
              sessionId: 'session-456', // Different sessionId
              message: 'second message',
              mode: 'CHAT_RESPONSE',
            },
          ],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('same sessionId');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should validate that array is not empty', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('At least one message');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should validate that all messages in context have required fields', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'first message',
              mode: 'CHAT_REQUEST',
            },
            {
              sessionId: 'session-123',
              message: '', // Missing message
              mode: 'CHAT_RESPONSE',
            },
          ],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('message is required');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should validate that context messages only use CHAT_REQUEST or CHAT_RESPONSE', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'first message',
              mode: 'CHAT_REQUEST',
            },
            {
              sessionId: 'session-123',
              message: 'second message',
              mode: 'SCREEN_RESPONSE' as any, // Invalid for context
            },
          ],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('CHAT_REQUEST or CHAT_RESPONSE');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should still work with single message (backward compatibility)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockConversationResponse,
        });

        const client = new JivaApiClient(mockConfig);
        await client.initiateConversation({
          sessionId: 'session-123',
          message: 'single message',
          mode: 'CHAT_REQUEST',
        });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              data: {
                default: [
                  {
                    sessionId: 'session-123',
                    message: 'single message',
                    mode: 'CHAT_REQUEST',
                  },
                ],
              },
            }),
          })
        );
      });

      it('should handle context with polling', async () => {
        const runningResponse: ConversationResponse = {
          ...mockConversationResponse,
          json: {
            default: {
              ...mockConversationResponse.json.default,
              state: 'RUNNING',
              id: 'exec-456',
            },
          },
        };

        const pollResponse: PollResponse = {
          workflowExecutionId: 'exec-123',
          errorMessages: null,
          data: {},
          strings: {},
          base64Files: {},
          vectorDatabaseIndexIds: {},
          metadata: {},
          json: {
            default: {
              state: 'OK',
              mode: 'POLL_RESPONSE',
              logs: ['Processing complete'],
              executions: [
                {
                  startTime: 1234567890,
                  state: 'OK',
                  output: {
                    response: 'Execution completed',
                    type: 'text',
                  },
                },
              ],
            },
          },
        };

        // Mock initial RUNNING response
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => runningResponse,
        });

        // Mock polling response (OK)
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => pollResponse,
        });

        jest.useFakeTimers();

        const onSuccess = jest.fn();
        const client = new JivaApiClient(mockConfig);
        const promise = client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'context message',
              mode: 'CHAT_REQUEST',
            },
            {
              sessionId: 'session-123',
              message: 'response',
              mode: 'CHAT_RESPONSE',
            },
          ],
          { maxAttempts: 5, pollInterval: 100 },
          onSuccess
        );

        jest.advanceTimersByTime(100);
        await jest.runAllTimersAsync();

        const response = await promise;

        expect(response.data).toBeDefined();
        expect(onSuccess).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });
    });

    describe('screen satisfaction', () => {
      it('should send screen satisfaction fields in single message', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockConversationResponse,
        });

        const client = new JivaApiClient(mockConfig);
        await client.initiateConversation({
          sessionId: 'session-123',
          message: 'create a professional RFQ document',
          mode: 'CHAT_REQUEST',
          nodeId: 'node-123',
          field: 'file-field',
          assetId: 'asset-456',
        });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              data: {
                default: [
                  {
                    sessionId: 'session-123',
                    message: 'create a professional RFQ document',
                    mode: 'CHAT_REQUEST',
                    nodeId: 'node-123',
                    field: 'file-field',
                    assetId: 'asset-456',
                  },
                ],
              },
            }),
          })
        );
      });

      it('should send screen satisfaction fields in context array', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockConversationResponse,
        });

        const client = new JivaApiClient(mockConfig);
        await client.initiateConversation([
          {
            sessionId: 'session-123',
            message: 'create a professional RFQ document',
            mode: 'CHAT_REQUEST',
            nodeId: 'node-123',
            field: 'file-field',
            assetId: 'asset-456',
          },
        ]);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              data: {
                default: [
                  {
                    sessionId: 'session-123',
                    message: 'create a professional RFQ document',
                    mode: 'CHAT_REQUEST',
                    nodeId: 'node-123',
                    field: 'file-field',
                    assetId: 'asset-456',
                  },
                ],
              },
            }),
          })
        );
      });

      it('should validate that all screen satisfaction fields are provided together', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          {
            sessionId: 'session-123',
            message: 'create a professional RFQ document',
            mode: 'CHAT_REQUEST',
            nodeId: 'node-123',
            // Missing field and assetId
          },
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('nodeId, field, and assetId must all be provided');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should validate screen satisfaction fields in context array', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.initiateConversation(
          [
            {
              sessionId: 'session-123',
              message: 'create a professional RFQ document',
              mode: 'CHAT_REQUEST',
              nodeId: 'node-123',
              field: 'file-field',
              // Missing assetId
            },
          ],
          {},
          undefined,
          onError
        );

        expect(response.error).toContain('nodeId, field, and assetId must all be provided');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should handle SCREEN_RESPONSE in conversation response', async () => {
        // Reset any previous mocks to ensure clean state
        (global.fetch as jest.Mock).mockReset();
        
        const screenResponse: ConversationResponse = {
          workflowExecutionId: 'exec-123',
          errorMessages: null,
          data: {},
          strings: {},
          base64Files: {},
          vectorDatabaseIndexIds: {},
          metadata: {},
          json: {
            default: {
              message: 'Please provide the required file',
              state: 'OK',
              mode: 'SCREEN_RESPONSE',
              screens: [
                {
                  nodeId: 'node-123',
                  field: 'file-field',
                  asset: {
                    type: 'FILE_UPLOAD',
                    message: 'Please upload the RFQ template file',
                  },
                },
              ],
            },
          },
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => screenResponse,
        });

        const onSuccess = jest.fn();
        const client = new JivaApiClient(mockConfig);
        const response = await client.initiateConversation(
          {
            sessionId: 'session-123',
            message: 'create a professional RFQ document',
            mode: 'CHAT_REQUEST',
          },
          {},
          onSuccess
        );

        expect(response.data).toEqual(screenResponse);
        expect(response.data?.json.default.mode).toBe('SCREEN_RESPONSE');
        expect(response.data?.json.default.screens).toBeDefined();
        expect(response.data?.json.default.screens?.[0].nodeId).toBe('node-123');
        expect(onSuccess).toHaveBeenCalledWith(screenResponse, 200);
      });
    });
  });

  describe('poll', () => {
    const mockPollResponse: PollResponse = {
      workflowExecutionId: 'exec-123',
      errorMessages: null,
      data: {},
      strings: {},
      base64Files: {},
      vectorDatabaseIndexIds: {},
      metadata: {},
      json: {
        default: {
          state: 'OK',
          mode: 'POLL_RESPONSE',
          logs: ['Processing complete'],
          executions: [
            {
              startTime: 1234567890,
              state: 'OK',
              output: {
                response: 'Execution completed',
                type: 'text',
                data: { result: 'success' },
              },
            },
          ],
        },
      },
    };

    it('should validate sessionId is required', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.poll(
        {
          sessionId: '',
          id: 'exec-456',
          mode: 'POLL_REQUEST',
        },
        undefined,
        onError
      );

      expect(response.error).toBe('sessionId is required');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalledWith('sessionId is required');
    });

    it('should validate id is required', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.poll(
        {
          sessionId: 'session-123',
          id: '',
          mode: 'POLL_REQUEST',
        },
        undefined,
        onError
      );

      expect(response.error).toBe('id is required');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalledWith('id is required');
    });

    it('should validate mode must be POLL_REQUEST', async () => {
      const client = new JivaApiClient(mockConfig);
      const onError = jest.fn();

      const response = await client.poll(
        {
          sessionId: 'session-123',
          id: 'exec-456',
          mode: 'CHAT_REQUEST' as any,
        },
        undefined,
        onError
      );

      expect(response.error).toBe('mode must be POLL_REQUEST');
      expect(response.status).toBe(400);
      expect(onError).toHaveBeenCalledWith('mode must be POLL_REQUEST');
    });

    it('should send correct payload structure for POLL_REQUEST', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPollResponse,
      });

      const client = new JivaApiClient(mockConfig);
      await client.poll({
        sessionId: 'session-123',
        id: 'exec-456',
        mode: 'POLL_REQUEST',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.jiva.ai/public-api/workflow/test-workflow-id/0/invoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              default: [
                {
                  sessionId: 'session-123',
                  id: 'exec-456',
                  mode: 'POLL_REQUEST',
                },
              ],
            },
          }),
        })
      );
    });

    it('should call success callback on successful poll', async () => {
      // Reset any previous mocks to ensure clean state
      (global.fetch as jest.Mock).mockReset();
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPollResponse,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.poll(
        {
          sessionId: 'session-123',
          id: 'exec-456',
          mode: 'POLL_REQUEST',
        },
        onSuccess
      );

      expect(response.data).toEqual(mockPollResponse);
      expect(onSuccess).toHaveBeenCalledWith(mockPollResponse, 200);
    });

    it('should handle RUNNING state in poll response', async () => {
      // Reset any previous mocks to ensure clean state
      (global.fetch as jest.Mock).mockReset();
      
      const runningPollResponse: PollResponse = {
        ...mockPollResponse,
        json: {
          default: {
            state: 'RUNNING',
            mode: 'POLL_RESPONSE',
            logs: ['Still processing...'],
            executions: [
              {
                startTime: 1234567890,
                state: 'RUNNING',
                output: {
                  response: 'Processing...',
                  type: 'text',
                },
              },
            ],
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningPollResponse,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.poll(
        {
          sessionId: 'session-123',
          id: 'exec-456',
          mode: 'POLL_REQUEST',
        },
        onSuccess
      );

      expect(response.data).toEqual(runningPollResponse);
      expect(response.data?.json.default.state).toBe('RUNNING');
      expect(onSuccess).toHaveBeenCalledWith(runningPollResponse, 200);
    });

    it('should handle PARTIAL_OK state in poll response', async () => {
      // Reset any previous mocks to ensure clean state
      (global.fetch as jest.Mock).mockReset();
      
      const partialPollResponse: PollResponse = {
        ...mockPollResponse,
        json: {
          default: {
            state: 'PARTIAL_OK',
            mode: 'POLL_RESPONSE',
            logs: ['Partial completion'],
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => partialPollResponse,
      });

      const onSuccess = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const response = await client.poll(
        {
          sessionId: 'session-123',
          id: 'exec-456',
          mode: 'POLL_REQUEST',
        },
        onSuccess
      );

      expect(response.data).toEqual(partialPollResponse);
      expect(response.data?.json.default.state).toBe('PARTIAL_OK');
      expect(onSuccess).toHaveBeenCalledWith(partialPollResponse, 200);
    });

    it('should call error callback on failed poll', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not found' }),
      });

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      await client.poll(
        {
          sessionId: 'session-123',
          id: 'exec-456',
          mode: 'POLL_REQUEST',
        },
        undefined,
        onError
      );

      expect(onError).toHaveBeenCalledWith('Not found', 404);
    });

    it('should handle ERROR state in poll response with json.default.logs', async () => {
      const mockConversationResponse: ConversationResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            message: 'Request processed',
            state: 'OK',
            mode: 'CHAT_RESPONSE',
            executions: [
              {
                response: 'Execution completed',
                type: 'text',
              },
            ],
          },
        },
      };
      const runningResponse: ConversationResponse = {
        ...mockConversationResponse,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'RUNNING',
            id: 'exec-456',
          },
        },
      };

      const errorPollResponse: PollResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            state: 'ERROR',
            mode: 'POLL_RESPONSE',
            logs: ['Error occurred', 'Failed to process'],
          },
        },
      };

      // Mock initial RUNNING response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningResponse,
      });

      // Mock polling response with ERROR
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorPollResponse,
      });

      jest.useFakeTimers();

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const promise = client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        { maxAttempts: 5, pollInterval: 100 },
        undefined,
        onError
      );

      jest.advanceTimersByTime(100);
      await jest.runAllTimersAsync();

      const response = await promise;

      expect(onError).toHaveBeenCalledWith('Error occurred\nFailed to process', 200);

      jest.useRealTimers();
    });

    it('should handle ERROR state in poll response with errorMessages', async () => {
      const mockConversationResponse: ConversationResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            message: 'Request processed',
            state: 'OK',
            mode: 'CHAT_RESPONSE',
            executions: [
              {
                response: 'Execution completed',
                type: 'text',
              },
            ],
          },
        },
      };
      const runningResponse: ConversationResponse = {
        ...mockConversationResponse,
        json: {
          default: {
            ...mockConversationResponse.json.default,
            state: 'RUNNING',
            id: 'exec-456',
          },
        },
      };

      const errorPollResponse: PollResponse = {
        workflowExecutionId: 'exec-123',
        errorMessages: 'Polling error occurred',
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            state: 'ERROR',
            mode: 'POLL_RESPONSE',
          },
        },
      };

      // Mock initial RUNNING response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => runningResponse,
      });

      // Mock polling response with ERROR
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => errorPollResponse,
      });

      jest.useFakeTimers();

      const onError = jest.fn();
      const client = new JivaApiClient(mockConfig);
      const promise = client.initiateConversation(
        {
          sessionId: 'session-123',
          message: 'test message',
          mode: 'CHAT_REQUEST',
        },
        { maxAttempts: 5, pollInterval: 100 },
        undefined,
        onError
      );

      jest.advanceTimersByTime(100);
      await jest.runAllTimersAsync();

      const response = await promise;

      expect(onError).toHaveBeenCalledWith('Polling error occurred', 200);

      jest.useRealTimers();
    });
  });

  describe('upload methods', () => {
    const mockUploadResponse: UploadResponse = {
      workflowExecutionId: 'upload-exec-123',
      errorMessages: null,
      data: {},
      strings: {
        default: 'asset-id-123',
      },
      base64Files: {},
      vectorDatabaseIndexIds: {},
      metadata: {},
      json: {},
    };

    describe('uploadFile', () => {
      // Mock FileReader for Node.js environment
      beforeEach(() => {
        (global as any).FileReader = class MockFileReader {
          result: string | null = null;
          onload: ((event: any) => void) | null = null;
          onerror: ((event: any) => void) | null = null;
          
          readAsDataURL(file: File | Blob) {
            // Simulate async file reading using setImmediate for Node.js
            const self = this;
            if (typeof setImmediate !== 'undefined') {
              setImmediate(() => {
                const base64 = Buffer.from('test content').toString('base64');
                self.result = `data:text/plain;base64,${base64}`;
                if (self.onload) {
                  self.onload({ target: self } as any);
                }
              });
            } else {
              // Fallback for environments without setImmediate
              setTimeout(() => {
                const base64 = Buffer.from('test content').toString('base64');
                self.result = `data:text/plain;base64,${base64}`;
                if (self.onload) {
                  self.onload({ target: self } as any);
                }
              }, 0);
            }
          }
        };
      });

      afterEach(() => {
        delete (global as any).FileReader;
      });

      it('should upload a file and return assetId', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUploadResponse,
        });

        const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
        const onSuccess = jest.fn();
        const client = new JivaApiClient(mockConfig);
        
        // FileReader is async, wait for it to complete by flushing the event loop
        const responsePromise = client.uploadFile(file, onSuccess);
        // Flush setImmediate callbacks - need to wait a bit for FileReader to complete
        await new Promise(resolve => {
          setImmediate(() => {
            setImmediate(resolve); // Double flush to ensure FileReader promise resolves
          });
        });
        const response = await responsePromise;

        expect(response.data).toEqual(mockUploadResponse);
        expect(response.data?.strings.default).toBe('asset-id-123');
        expect(onSuccess).toHaveBeenCalledWith(mockUploadResponse, 200);
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        expect(fetchCall[0]).toBe('https://api.jiva.ai/public-api/workflow/file-cache-workflow-id/0/invoke');
        expect(fetchCall[1]).toMatchObject({
          method: 'POST',
          headers: expect.objectContaining({
            'api-key': 'file-cache-api-key',
          }),
        });
        const body = JSON.parse(fetchCall[1].body);
        expect(body).toHaveProperty('base64FileBytes');
        expect(body.base64FileBytes).toHaveProperty('default');
        expect(typeof body.base64FileBytes.default).toBe('string');
      });

      it('should upload a base64 string', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUploadResponse,
        });

        const base64String = 'dGVzdCBjb250ZW50';
        const client = new JivaApiClient(mockConfig);
        await client.uploadFile(base64String);

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        expect(fetchCall[0]).toBe('https://api.jiva.ai/public-api/workflow/file-cache-workflow-id/0/invoke');
        expect(fetchCall[1]).toMatchObject({
          method: 'POST',
          headers: expect.objectContaining({
            'api-key': 'file-cache-api-key',
          }),
        });
        const body = JSON.parse(fetchCall[1].body);
        expect(body).toEqual({
          base64FileBytes: {
            default: 'dGVzdCBjb250ZW50',
          },
        });
      });

      it('should call error callback on failed upload', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Invalid file' }),
        });

        const file = new File(['test'], 'test.txt');
        const onError = jest.fn();
        const client = new JivaApiClient(mockConfig);
        const responsePromise = client.uploadFile(file, undefined, onError);
        // Flush setImmediate callbacks for FileReader - double flush to ensure promise resolves
        await new Promise(resolve => {
          setImmediate(() => {
            setImmediate(resolve);
          });
        });
        await responsePromise;

        expect(onError).toHaveBeenCalledWith('Invalid file', 400);
      });
    });

    describe('uploadText', () => {
      it('should upload text and return assetId', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUploadResponse,
        });

        const onSuccess = jest.fn();
        const client = new JivaApiClient(mockConfig);
        const response = await client.uploadText('Sample text content', onSuccess);

        expect(response.data).toEqual(mockUploadResponse);
        expect(response.data?.strings.default).toBe('asset-id-123');
        expect(onSuccess).toHaveBeenCalledWith(mockUploadResponse, 200);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/text-cache-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'api-key': 'text-cache-api-key',
            }),
            body: JSON.stringify({
              strings: {
                default: 'Sample text content',
              },
            }),
          })
        );
      });

      it('should validate that text is provided', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.uploadText('', undefined, onError);

        expect(response.error).toBe('Text content is required');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalledWith('Text content is required');
      });

      it('should call error callback on failed upload', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Invalid text' }),
        });

        const onError = jest.fn();
        const client = new JivaApiClient(mockConfig);
        await client.uploadText('test', undefined, onError);

        expect(onError).toHaveBeenCalledWith('Invalid text', 400);
      });
    });

    describe('uploadTable', () => {
      it('should upload table data and return assetId', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUploadResponse,
        });

        const tableData = [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ];

        const onSuccess = jest.fn();
        const client = new JivaApiClient(mockConfig);
        const response = await client.uploadTable(tableData, onSuccess);

        expect(response.data).toEqual(mockUploadResponse);
        expect(response.data?.strings.default).toBe('asset-id-123');
        expect(onSuccess).toHaveBeenCalledWith(mockUploadResponse, 200);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jiva.ai/public-api/workflow/table-cache-workflow-id/0/invoke',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'api-key': 'table-cache-api-key',
            }),
            body: JSON.stringify({
              data: {
                default: tableData,
              },
            }),
          })
        );
      });

      it('should validate that table data is provided', async () => {
        const client = new JivaApiClient(mockConfig);
        const onError = jest.fn();

        const response = await client.uploadTable([], undefined, onError);

        expect(response.error).toContain('Table data is required');
        expect(response.status).toBe(400);
        expect(onError).toHaveBeenCalled();
      });

      it('should call error callback on failed upload', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Invalid table data' }),
        });

        const onError = jest.fn();
        const client = new JivaApiClient(mockConfig);
        await client.uploadTable([{ col1: 'value' }], undefined, onError);

        expect(onError).toHaveBeenCalledWith('Invalid table data', 400);
      });
    });
  });

  describe('subscribeToSocket', () => {
    // Mock EventSource for testing
    class MockEventSource {
      url: string;
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState: number = MockEventSource.CONNECTING; // CONNECTING = 0
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private eventListeners: Map<string, Array<(event: MessageEvent) => void>> = new Map();

      constructor(url: string, eventSourceInitDict?: EventSourceInit) {
        this.url = url;
        // Simulate connection - use setImmediate to ensure it happens after constructor
        // but allow tests to flush it
        const self = this;
        setImmediate(() => {
          self.readyState = MockEventSource.OPEN; // OPEN = 1
          
          // Spring backend sends a "connected" event first
          // Simulate this by emitting the "connected" event
          const connectedListeners = self.eventListeners.get('connected');
          if (connectedListeners && connectedListeners.length > 0) {
            // Create a minimal MessageEvent-like object for testing
            const connectedEvent = {
              type: 'connected',
              data: `Connected to topic: ${url}`,
              target: self,
              lastEventId: '',
              origin: '',
              ports: [],
              source: null,
            } as unknown as MessageEvent;
            connectedListeners.forEach(listener => listener(connectedEvent));
          }
          
          // Also trigger onopen as fallback
          if (self.onopen) {
            // Create a mock Event object (Event is not available in Node.js)
            const openEvent = { type: 'open', target: self };
            self.onopen(openEvent as any);
          }
        });
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void): void {
        if (!this.eventListeners.has(type)) {
          this.eventListeners.set(type, []);
        }
        this.eventListeners.get(type)!.push(listener);
      }

      removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
          const index = listeners.indexOf(listener);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      }

      close() {
        this.readyState = MockEventSource.CLOSED; // CLOSED = 2
        // EventSource triggers onerror when closed, which our implementation uses to call onClose
        if (this.onerror) {
          const errorEvent = { type: 'error', target: this };
          this.onerror(errorEvent as any);
        }
      }
    }

    beforeEach(() => {
      // @ts-ignore - Mock EventSource globally
      global.EventSource = MockEventSource as any;
    });

    afterEach(() => {
      // @ts-ignore - Restore
      delete (global as any).EventSource;
    });

    it('should create EventSource with correct URL', () => {
      const client = new JivaApiClient(mockConfig);
      const es = client.subscribeToSocket('session-123');

      expect(es).toBeInstanceOf(MockEventSource);
      expect(es.url).toBe('https://api.jiva.ai/public-api/workflow-chat/test-workflow-id/session-123');
    });

    it('should use custom base URL when provided', () => {
      const customConfig = {
        ...mockConfig,
        baseUrl: 'https://test-platform.example.com/public-api/workflow',
      };
      const client = new JivaApiClient(customConfig);
      const es = client.subscribeToSocket('session-123');

      expect(es.url).toBe('https://test-platform.example.com/public-api/workflow-chat/test-workflow-id/session-123');
    });

    it('should use http:// for http:// base URLs', () => {
      const customConfig = {
        ...mockConfig,
        baseUrl: 'http://localhost:3000/public-api/workflow',
      };
      const client = new JivaApiClient(customConfig);
      const es = client.subscribeToSocket('session-123');

      expect(es.url).toBe('http://localhost:3000/public-api/workflow-chat/test-workflow-id/session-123');
    });

    it('should throw error if sessionId is missing', () => {
      const client = new JivaApiClient(mockConfig);
      expect(() => {
        client.subscribeToSocket('');
      }).toThrow('sessionId is required');
    });

    it('should call onOpen callback when EventSource connects (via "connected" event)', (done) => {
      const client = new JivaApiClient(mockConfig);
      let testCompleted = false;
      const onOpen = jest.fn(() => {
        if (testCompleted) {
          return; // Prevent multiple calls
        }
        testCompleted = true;
        expect(onOpen).toHaveBeenCalled();
        done();
      });

      const es = client.subscribeToSocket('session-123', { onOpen });

      // Flush setImmediate to trigger the "connected" event
      // The mock EventSource constructor uses setImmediate and emits "connected" event
      setImmediate(() => {
        // If callback wasn't called yet, wait one more tick
        if (!onOpen.mock.calls.length) {
          setImmediate(() => {
            // Should be called by now via "connected" event
            if (!onOpen.mock.calls.length && !testCompleted) {
              testCompleted = true;
              done(new Error('onOpen was not called'));
            }
          });
        }
      });

      // Safety timeout
      setTimeout(() => {
        if (!testCompleted) {
          testCompleted = true;
          done(new Error('Test timed out waiting for onOpen'));
        }
      }, 5000);
    }, 10000); // Increase timeout for this test

    it('should handle "connected" event from Spring backend', (done) => {
      const client = new JivaApiClient(mockConfig);
      let testCompleted = false;
      const onOpen = jest.fn(() => {
        if (testCompleted) {
          return; // Prevent multiple calls
        }
        testCompleted = true;
        expect(onOpen).toHaveBeenCalledTimes(1);
        done();
      });

      const es = client.subscribeToSocket('session-123', { onOpen });

      // The MockEventSource emits "connected" event in setImmediate
      // This simulates Spring's SseEmitter.event().name("connected").data("Connected to topic: ...")
      setImmediate(() => {
        // onOpen should be called via the "connected" event listener
        if (!onOpen.mock.calls.length) {
          setImmediate(() => {
            if (!onOpen.mock.calls.length && !testCompleted) {
              testCompleted = true;
              done(new Error('onOpen was not called via "connected" event'));
            }
          });
        }
      });

      // Safety timeout
      setTimeout(() => {
        if (!testCompleted) {
          testCompleted = true;
          done(new Error('Test timed out waiting for onOpen'));
        }
      }, 5000);
    }, 10000);

    it('should call onMessage callback when message is received', (done) => {
      const client = new JivaApiClient(mockConfig);
      const mockMessage: SocketMessage = {
        workflowId: 'workflow-123',
        sessionId: 'session-123',
        message: 'Agent is thinking...',
        types: ['AGENT_THINKING'],
      };

      let messageReceived = false;
      const onMessage = jest.fn((message) => {
        if (messageReceived) {
          return; // Prevent multiple calls
        }
        messageReceived = true;
        expect(message).toEqual(mockMessage);
        expect(onMessage).toHaveBeenCalledWith(mockMessage);
        done();
      });

      // Provide onOpen to ensure connection is established
      const onOpen = jest.fn(() => {
        // Once connection is open, wait a tick then send the message
        setImmediate(() => {
          if (es.onmessage) {
            const messageEvent = {
              data: JSON.stringify(mockMessage),
              type: 'message',
              target: es,
              lastEventId: '',
              origin: '',
              ports: [],
              source: null,
            } as unknown as MessageEvent;
            es.onmessage(messageEvent);
          } else {
            done(new Error('onmessage handler not set'));
          }
        });
      });

      const es = client.subscribeToSocket('session-123', { onOpen, onMessage });

      // Set a timeout in case something goes wrong
      setTimeout(() => {
        if (!messageReceived) {
          done(new Error('onMessage was not called within timeout'));
        }
      }, 5000);
    }, 10000); // Increase timeout for this test

    it('should call onClose callback when EventSource closes', (done) => {
      const client = new JivaApiClient(mockConfig);
      const onClose = jest.fn((event) => {
        expect(event.code).toBe(0); // EventSource doesn't have close codes, uses 0
        expect(onClose).toHaveBeenCalled();
        done();
      });

      const es = client.subscribeToSocket('session-123', { onClose });

      // Wait for EventSource to open, then close it
      setImmediate(() => {
        // EventSource should be open by now (readyState === 1)
        // Close it - this should trigger onerror with CLOSED state, which triggers onClose
        es.close();
      });
    }, 10000); // Increase timeout for this test

    it('should handle invalid JSON in messages gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const client = new JivaApiClient(mockConfig);
      const onMessage = jest.fn();

      const es = client.subscribeToSocket('session-123', { onMessage });

      setTimeout(() => {
        if (es.onmessage) {
          es.onmessage({
            data: 'invalid json',
          } as MessageEvent);
        }
        expect(consoleSpy).toHaveBeenCalled();
        expect(onMessage).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      }, 20);
    });
  });
});

