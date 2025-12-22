/**
 * Integration tests for Jiva.ai Agent Chat SDK
 * 
 * These tests make real API calls to a local Jiva.ai instance.
 * 
 * IMPORTANT: These tests are SKIPPED BY DEFAULT.
 * 
 * To run these tests:
 * 1. Ensure the local Jiva.ai instance is running
 * 2. Set RUN_INTEGRATION_TESTS=true in the same command line:
 *    RUN_INTEGRATION_TESTS=true npm test -- integration.test.ts
 * 
 * Configuration:
 * - All workflow IDs and API keys are configured below
 * - Base URL: https://local.jiva.ai:8445/public-api/workflow
 * - Socket Base URL: https://local.jiva.ai:8445/api
 * - All workflows use version "0"
 */

/// <reference types="node" />

import { JivaApiClient } from '../api';
import { ApiConfig } from '../types';

// Integration tests are skipped by default
// Set RUN_INTEGRATION_TESTS=true to enable them
// IMPORTANT: Environment variable must be set in the same command line:
//   RUN_INTEGRATION_TESTS=true npm test -- integration.test.ts
const runIntegrationTests = 
  process.env.RUN_INTEGRATION_TESTS === 'true' || 
  String(process.env.RUN_INTEGRATION_TESTS || '').toLowerCase() === 'true';

// Local test configuration
const localConfig: ApiConfig = {
  apiKey: 'EdD5F92kCp8=',
  workflowId: '6941973e746ffc2695a4a5a1',
  workflowVersion: '0',
  fileUploadCacheWorkflowId: '6941973d746ffc2695a49b32',
  fileUploadCacheVersion: '0',
  fileUploadCacheApiKey: 'ag58iew4ALw=',
  textUploadCacheWorkflowId: '6941973e746ffc2695a49eb0',
  textUploadCacheVersion: '0',
  textUploadCacheApiKey: 'EP0fbtmcTgc=',
  tableUploadCacheWorkflowId: '6941973e746ffc2695a4a223',
  tableUploadCacheVersion: '0',
  tableUploadCacheApiKey: 'cRqo0rGkoYI=',
  baseUrl: 'https://local.jiva.ai:8445/public-api/workflow',
  logging: {
    level: 'warn',
  },
};

// Integration tests are skipped by default - only run when RUN_INTEGRATION_TESTS=true
if (runIntegrationTests) {
  describe('Integration Tests (Real API)', () => {
    const client = new JivaApiClient(localConfig);

    beforeAll(() => {
      // Integration tests are running
    });

    describe('Real API conversation flow with WebSocket', () => {
    it(
      'should complete full flow with real API and WebSocket updates',
      async () => {
        if (!runIntegrationTests) {
          return;
        }

        const sessionId = `integration-test-${Date.now()}`;
        const socketMessages: Array<{ type: string; message: string }> = [];

        // Set up WebSocket connection
        const ws = client.subscribeToSocket(
          sessionId,
          {
            onOpen: () => {
              console.log('WebSocket connected');
            },
            onMessage: (message) => {
              socketMessages.push({
                type: message.types.join(', '),
                message: message.message,
              });
              console.log('Socket message:', message.types, message.message);
            },
            onClose: (event) => {
              console.log('WebSocket closed:', event.code, event.reason);
            },
            onError: (error) => {
              console.error('WebSocket error:', error);
            },
          },
          {
            autoReconnect: true,
            reconnectInterval: 2000,
            maxReconnectAttempts: 5,
          }
        );

        // Wait a bit for WebSocket to connect
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          // Step 1: Initiate conversation
          console.log('Step 1: Initiating conversation...');
          const initialResponse = await client.initiateConversation({
            sessionId,
            message: 'Hello, this is a test message',
            mode: 'CHAT_REQUEST',
          });

          console.log('Initial response:', initialResponse);
          console.log('Initial response state:', initialResponse.data?.json.default.state);
          console.log('Initial response mode:', initialResponse.data?.json.default.mode);

          if (initialResponse.data?.json.default.mode === 'SCREEN_RESPONSE') {
            const screens = initialResponse.data.json.default.screens || [];
            console.log(`Received ${screens.length} screen(s) requiring assets`);


            // Step 2: Upload assets first
            const assetIds: string[] = [];
            for (const screen of screens) {
              if (screen.asset.type === 'FILE_UPLOAD') {
                console.log(`Uploading file for screen ${screen.nodeId}...`);
                const fileUpload = await client.uploadFile('base64-test-file-content');
                if (fileUpload.data) {
                  assetIds.push(fileUpload.data.strings.default);
                  console.log(`File uploaded, assetId: ${fileUpload.data.strings.default}`);
                }
              } else {
                // For text/string uploads
                console.log(`Uploading text for screen ${screen.nodeId}...`);
                const textUpload = await client.uploadText('Test text content');
                if (textUpload.data) {
                  assetIds.push(textUpload.data.strings.default);
                  console.log(`Text uploaded, assetId: ${textUpload.data.strings.default}`);
                }
              }
            }

            // Step 3: Satisfy screens and continue with original question
            console.log('Step 3: Satisfying screens...');
            const originalQuestion = 'Hello, this is a test message';
            
            // Build follow-up messages with screen satisfaction
            // Messages must alternate CHAT_REQUEST/CHAT_RESPONSE
            const followUpMessages = screens.flatMap((screen, index) => {
              const messages = [];
              
              // Add message with screen satisfaction
              messages.push({
                sessionId,
                message: originalQuestion, // Include original question
                mode: 'CHAT_REQUEST' as const,
                nodeId: screen.nodeId,
                field: screen.field,
                assetId: assetIds[index],
              });
              
              // Add acknowledgment if not the last screen
              if (index < screens.length - 1) {
                messages.push({
                  sessionId,
                  message: 'ok',
                  mode: 'CHAT_RESPONSE' as const,
                });
              }
              
              return messages;
            });

            const followUpResponse = await client.initiateConversation(
              followUpMessages.length === 1
                ? followUpMessages[0]
                : followUpMessages,
              {
                maxAttempts: 30,
                pollInterval: 2000,
              }
            );

            console.log('Follow-up response state:', followUpResponse.data?.json.default.state);

            // Wait for WebSocket messages
            await new Promise((resolve) => setTimeout(resolve, 5000));

            console.log(`Received ${socketMessages.length} WebSocket messages`);
            expect(socketMessages.length).toBeGreaterThan(0);
          } else {
            // No screens, direct response
            console.log('No screens required, direct response received');
            expect(initialResponse.data).toBeDefined();
          }

          // Close WebSocket
          ws.close();
        } catch (error) {
          ws.close();
          throw error;
        }

        // Give some time for final WebSocket messages
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
      60000 // 60 second timeout
    );
    });

    describe('Real API - Simple conversation', () => {
    it(
      'should make a simple conversation request',
      async () => {
        if (!runIntegrationTests) {
          return;
        }

        const sessionId = `simple-test-${Date.now()}`;

        const response = await client.initiateConversation({
          sessionId,
          message: 'What can you do?',
          mode: 'CHAT_REQUEST',
        });

        expect(response.error).toBeUndefined();
        expect(response.data).toBeDefined();
        expect(response.data?.json.default).toBeDefined();

        console.log('Response state:', response.data?.json.default.state);
        console.log('Response mode:', response.data?.json.default.mode);
        console.log('Response message:', response.data?.json.default.message);
      },
      30000 // 30 second timeout
    );
    });

    describe('Real API - Upload tests', () => {
    it(
      'should upload a file',
      async () => {
        if (!runIntegrationTests) {
          return;
        }

        const fileContent = Buffer.from('test file content').toString('base64');
        const response = await client.uploadFile(fileContent);

        expect(response.error).toBeUndefined();
        expect(response.data).toBeDefined();
        expect(response.data?.strings.default).toBeDefined();

        console.log('File upload assetId:', response.data?.strings.default);
      },
      30000
    );

    it(
      'should upload text',
      async () => {
        if (!runIntegrationTests) {
          return;
        }

        const response = await client.uploadText('This is test text content');

        expect(response.error).toBeUndefined();
        expect(response.data).toBeDefined();
        expect(response.data?.strings.default).toBeDefined();

        console.log('Text upload assetId:', response.data?.strings.default);
      },
      30000
    );
    });
  }); // Close the describe block
} else {
  // Tests are skipped by default
  describe.skip('Integration Tests (Real API)', () => {
    it('should be skipped when RUN_INTEGRATION_TESTS is not set', () => {
      // This test is skipped by default
      // Set RUN_INTEGRATION_TESTS=true to run integration tests
    });
  });
}

// Alternative: Use describe.only to run only integration tests
// Or use a separate test command: RUN_INTEGRATION_TESTS=true npm test -- integration.test.ts

