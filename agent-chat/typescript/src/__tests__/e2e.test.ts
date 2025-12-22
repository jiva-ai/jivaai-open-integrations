/**
 * End-to-end tests for Jiva.ai Agent Chat SDK
 * 
 * These tests mock the remote API and test the complete flow:
 * 1. Initiate conversation
 * 2. Handle screen responses
 * 3. Upload assets
 * 4. Satisfy screens
 * 5. Poll for completion
 */

import { JivaApiClient } from '../api';
import { ApiConfig, ConversationResponse, UploadResponse, PollResponse } from '../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('End-to-End Flow', () => {
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

  describe('Complete conversation flow with screen responses', () => {
    it('should handle complete flow: question -> screen -> upload -> satisfy -> poll -> complete', async () => {
      const sessionId = 'e2e-test-session-123';

      // Step 1: Initial conversation request - returns SCREEN_RESPONSE
      const screenResponse: ConversationResponse = {
        workflowExecutionId: 'exec-initial',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            message: 'Please provide the required files and text',
            state: 'OK',
            mode: 'SCREEN_RESPONSE',
            screens: [
              {
                nodeId: 'file-node-123',
                field: 'file-field',
                asset: {
                  type: 'FILE_UPLOAD',
                  message: 'Please upload a document file',
                },
              },
              {
                nodeId: 'text-node-456',
                field: 'text-field',
                asset: {
                  type: 'FILE_POINTER_URL',
                  message: 'Please provide text content',
                },
              },
            ],
          },
        },
      };

      // Step 2: File upload response
      const fileUploadResponse: UploadResponse = {
        workflowExecutionId: 'upload-file-exec',
        errorMessages: null,
        data: {},
        strings: {
          default: 'file-asset-id-789',
        },
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {},
      };

      // Step 3: Text upload response
      const textUploadResponse: UploadResponse = {
        workflowExecutionId: 'upload-text-exec',
        errorMessages: null,
        data: {},
        strings: {
          default: 'text-asset-id-101',
        },
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {},
      };

      // Step 4: Follow-up conversation with screen satisfaction - returns RUNNING
      const runningResponse: ConversationResponse = {
        workflowExecutionId: 'exec-followup',
        errorMessages: null,
        data: {},
        strings: {},
        base64Files: {},
        vectorDatabaseIndexIds: {},
        metadata: {},
        json: {
          default: {
            message: 'Processing your request',
            state: 'RUNNING',
            mode: 'CHAT_RESPONSE',
            id: 'poll-id-456',
          },
        },
      };

      // Step 5: First poll - still RUNNING
      const pollResponse1: PollResponse = {
        workflowExecutionId: 'exec-followup',
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
            logs: ['Step 1 completed', 'Processing step 2...'],
            executions: [
              {
                startTime: 1234567890,
                state: 'OK',
                output: {
                  response: 'First step completed',
                  type: 'text',
                },
              },
            ],
          },
        },
      };

      // Step 6: Second poll - COMPLETE
      const pollResponse2: PollResponse = {
        workflowExecutionId: 'exec-followup',
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
            logs: ['Step 1 completed', 'Processing step 2...', 'All steps completed'],
            executions: [
              {
                startTime: 1234567890,
                state: 'OK',
                output: {
                  response: 'First step completed',
                  type: 'text',
                },
              },
              {
                startTime: 1234567900,
                state: 'OK',
                output: {
                  response: 'Second step completed',
                  type: 'text',
                },
              },
              {
                startTime: 1234567910,
                state: 'OK',
                output: {
                  response: 'Final result: Your request has been processed successfully',
                  type: 'text',
                  data: { result: 'success' },
                },
              },
            ],
          },
        },
      };

      // Mock all API calls in sequence
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          // Initial conversation
          ok: true,
          status: 200,
          json: async () => screenResponse,
        })
        .mockResolvedValueOnce({
          // File upload
          ok: true,
          status: 200,
          json: async () => fileUploadResponse,
        })
        .mockResolvedValueOnce({
          // Text upload
          ok: true,
          status: 200,
          json: async () => textUploadResponse,
        })
        .mockResolvedValueOnce({
          // Follow-up conversation (RUNNING)
          ok: true,
          status: 200,
          json: async () => runningResponse,
        })
        .mockResolvedValueOnce({
          // First poll (RUNNING)
          ok: true,
          status: 200,
          json: async () => pollResponse1,
        })
        .mockResolvedValueOnce({
          // Second poll (OK)
          ok: true,
          status: 200,
          json: async () => pollResponse2,
        });

      const client = new JivaApiClient(mockConfig);
      const conversationSteps: string[] = [];

      // Step 1: Initiate conversation
      const initialResponse = await client.initiateConversation({
        sessionId,
        message: 'Process my document and text',
        mode: 'CHAT_REQUEST',
      });

      expect(initialResponse.data).toBeDefined();
      expect(initialResponse.data?.json.default.mode).toBe('SCREEN_RESPONSE');
      expect(initialResponse.data?.json.default.screens).toHaveLength(2);
      conversationSteps.push('Initial conversation returned screen response');

      const screens = initialResponse.data!.json.default.screens!;
      const fileScreen = screens.find((s) => s.asset.type === 'FILE_UPLOAD');
      const textScreen = screens.find((s) => s.asset.type === 'FILE_POINTER_URL');

      expect(fileScreen).toBeDefined();
      expect(textScreen).toBeDefined();

      // Step 2: Upload file
      const fileContent = 'base64-encoded-file-content';
      const fileUploadResult = await client.uploadFile(fileContent);

      expect(fileUploadResult.data).toBeDefined();
      expect(fileUploadResult.data?.strings.default).toBe('file-asset-id-789');
      conversationSteps.push('File uploaded successfully');

      // Step 3: Upload text
      const textContent = 'Sample text content for processing';
      const textUploadResult = await client.uploadText(textContent);

      expect(textUploadResult.data).toBeDefined();
      expect(textUploadResult.data?.strings.default).toBe('text-asset-id-101');
      conversationSteps.push('Text uploaded successfully');

      // Step 4: Satisfy screens and continue conversation
      // Include the original question along with screen satisfaction
      // Since messages must alternate CHAT_REQUEST/CHAT_RESPONSE, we structure it as:
      // - First message: Original question with first screen satisfaction (CHAT_REQUEST)
      // - Second message: Acknowledgment (CHAT_RESPONSE)
      // - Third message: Original question with second screen satisfaction (CHAT_REQUEST)
      const followUpPromise = client.initiateConversation(
        [
          {
            sessionId,
            message: 'Process my document and text',
            mode: 'CHAT_REQUEST',
            nodeId: fileScreen!.nodeId,
            field: fileScreen!.field,
            assetId: fileUploadResult.data!.strings.default,
          },
          {
            sessionId,
            message: 'ok',
            mode: 'CHAT_RESPONSE',
          },
          {
            sessionId,
            message: 'Process my document and text',
            mode: 'CHAT_REQUEST',
            nodeId: textScreen!.nodeId,
            field: textScreen!.field,
            assetId: textUploadResult.data!.strings.default,
          },
        ],
        {
          maxAttempts: 5,
          pollInterval: 100,
        }
      );

      // Wait for the promise to resolve (polling will happen automatically)
      const finalResponse = await followUpPromise;

      expect(finalResponse.data).toBeDefined();
      expect(finalResponse.data?.json.default.state).toBe('OK');
      expect(finalResponse.data?.json.default.executions).toBeDefined();
      expect(finalResponse.data?.json.default.executions!.length).toBeGreaterThan(0);
      conversationSteps.push('Conversation completed successfully');

      // Verify all steps were executed
      expect(conversationSteps).toEqual([
        'Initial conversation returned screen response',
        'File uploaded successfully',
        'Text uploaded successfully',
        'Conversation completed successfully',
      ]);

      // Verify all API calls were made
      expect(global.fetch).toHaveBeenCalledTimes(6);

      // Verify the follow-up request included screen satisfaction and original question
      const followUpCall = (global.fetch as jest.Mock).mock.calls[3];
      const followUpPayload = JSON.parse(followUpCall[1].body);
      expect(followUpPayload.data.default).toHaveLength(3);
      
      // First message: original question + first screen satisfaction
      expect(followUpPayload.data.default[0].message).toBe('Process my document and text');
      expect(followUpPayload.data.default[0].mode).toBe('CHAT_REQUEST');
      expect(followUpPayload.data.default[0].nodeId).toBe('file-node-123');
      expect(followUpPayload.data.default[0].assetId).toBe('file-asset-id-789');
      
      // Second message: acknowledgment
      expect(followUpPayload.data.default[1].message).toBe('ok');
      expect(followUpPayload.data.default[1].mode).toBe('CHAT_RESPONSE');
      
      // Third message: original question + second screen satisfaction
      expect(followUpPayload.data.default[2].message).toBe('Process my document and text');
      expect(followUpPayload.data.default[2].mode).toBe('CHAT_REQUEST');
      expect(followUpPayload.data.default[2].nodeId).toBe('text-node-456');
      expect(followUpPayload.data.default[2].assetId).toBe('text-asset-id-101');

      jest.useRealTimers();
    });
  });
});

