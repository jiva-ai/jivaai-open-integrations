// Settings management
const SETTINGS_KEY = 'jivaChatSettings';

const defaultSettings = {
    baseUrl: 'https://api.jiva.ai/public-api/workflow',
    chatWorkflowId: '',
    chatWorkflowVersion: '0',
    chatApiKey: '',
    fileUploadCacheWorkflowId: '',
    fileUploadCacheVersion: '0',
    fileUploadCacheApiKey: '',
    textUploadCacheWorkflowId: '',
    textUploadCacheVersion: '0',
    textUploadCacheApiKey: '',
    tableUploadCacheWorkflowId: '',
    tableUploadCacheVersion: '0',
    tableUploadCacheApiKey: '',
    socketBaseUrl: 'https://api.jiva.ai/public-api/workflow-chat',
};

let settings = { ...defaultSettings };
let currentSessionId = `session-${Date.now()}`;
let currentSSEConnection = null;

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const debugPanel = document.getElementById('debugPanel');
const debugLog = document.getElementById('debugLog');
const toggleDebugBtn = document.getElementById('toggleDebugBtn');
const clearDebugBtn = document.getElementById('clearDebugBtn');

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Migrate old chatEndpoint to baseUrl for backward compatibility
            if (parsed.chatEndpoint && !parsed.baseUrl) {
                parsed.baseUrl = parsed.chatEndpoint;
                delete parsed.chatEndpoint;
            }
            settings = { ...defaultSettings, ...parsed };
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    updateSettingsUI();
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateSettingsUI();
}

// Update settings form with current values
function updateSettingsUI() {
    document.getElementById('baseUrl').value = settings.baseUrl || defaultSettings.baseUrl;
    document.getElementById('socketBaseUrl').value = settings.socketBaseUrl || defaultSettings.socketBaseUrl;
    document.getElementById('chatWorkflowId').value = settings.chatWorkflowId || '';
    document.getElementById('chatWorkflowVersion').value = settings.chatWorkflowVersion || '0';
    document.getElementById('chatApiKey').value = settings.chatApiKey || '';
    document.getElementById('fileUploadCacheWorkflowId').value = settings.fileUploadCacheWorkflowId || '';
    document.getElementById('fileUploadCacheVersion').value = settings.fileUploadCacheVersion || '0';
    document.getElementById('fileUploadCacheApiKey').value = settings.fileUploadCacheApiKey || '';
    document.getElementById('textUploadCacheWorkflowId').value = settings.textUploadCacheWorkflowId || '';
    document.getElementById('textUploadCacheVersion').value = settings.textUploadCacheVersion || '0';
    document.getElementById('textUploadCacheApiKey').value = settings.textUploadCacheApiKey || '';
    document.getElementById('tableUploadCacheWorkflowId').value = settings.tableUploadCacheWorkflowId || '';
    document.getElementById('tableUploadCacheVersion').value = settings.tableUploadCacheVersion || '0';
    document.getElementById('tableUploadCacheApiKey').value = settings.tableUploadCacheApiKey || '';
}

// Helper function to remove trailing slashes from URLs
function removeTrailingSlash(url) {
    if (!url || typeof url !== 'string') {
        return url;
    }
    return url.replace(/\/+$/, '');
}

// Load settings from form
function loadSettingsFromForm() {
    // Get raw values
    const baseUrlRaw = document.getElementById('baseUrl').value || defaultSettings.baseUrl;
    const socketBaseUrlRaw = document.getElementById('socketBaseUrl').value || defaultSettings.socketBaseUrl;
    
    // Remove trailing slashes from URLs
    const baseUrl = removeTrailingSlash(baseUrlRaw);
    const socketBaseUrl = removeTrailingSlash(socketBaseUrlRaw);
    
    // Update form fields to reflect cleaned values (if they changed)
    if (baseUrl !== baseUrlRaw) {
        document.getElementById('baseUrl').value = baseUrl;
    }
    if (socketBaseUrl !== socketBaseUrlRaw) {
        document.getElementById('socketBaseUrl').value = socketBaseUrl;
    }
    
    settings = {
        baseUrl: baseUrl,
        chatWorkflowId: document.getElementById('chatWorkflowId').value,
        chatWorkflowVersion: document.getElementById('chatWorkflowVersion').value || '0',
        chatApiKey: document.getElementById('chatApiKey').value,
        fileUploadCacheWorkflowId: document.getElementById('fileUploadCacheWorkflowId').value,
        fileUploadCacheVersion: document.getElementById('fileUploadCacheVersion').value || '0',
        fileUploadCacheApiKey: document.getElementById('fileUploadCacheApiKey').value,
        textUploadCacheWorkflowId: document.getElementById('textUploadCacheWorkflowId').value,
        textUploadCacheVersion: document.getElementById('textUploadCacheVersion').value || '0',
        textUploadCacheApiKey: document.getElementById('textUploadCacheApiKey').value,
        tableUploadCacheWorkflowId: document.getElementById('tableUploadCacheWorkflowId').value,
        tableUploadCacheVersion: document.getElementById('tableUploadCacheVersion').value || '0',
        tableUploadCacheApiKey: document.getElementById('tableUploadCacheApiKey').value,
        socketBaseUrl: socketBaseUrl,
    };
}

// Validate settings
function validateSettings() {
    if (!settings.chatWorkflowId || !settings.chatApiKey) {
        return false;
    }
    return true;
}

// Mask sensitive information (API keys, tokens, etc.)
function maskSensitiveData(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => maskSensitiveData(item));
    }

    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('apikey') || lowerKey.includes('api_key') || 
            lowerKey.includes('token') || lowerKey.includes('password') ||
            lowerKey.includes('secret') || lowerKey.includes('auth')) {
            masked[key] = '***MASKED***';
        } else if (typeof value === 'object' && value !== null) {
            masked[key] = maskSensitiveData(value);
        } else {
            masked[key] = value;
        }
    }
    return masked;
}

// Format data as cURL command
function formatAsCurl(method, url, headers, body, maskedHeaders = {}) {
    let curl = `curl -X ${method} \\\n  '${url}'`;
    
    // Add headers
    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            const displayValue = maskedHeaders[key] !== undefined ? maskedHeaders[key] : value;
            // Escape single quotes in header values
            const escapedValue = String(displayValue).replace(/'/g, "'\\''");
            curl += ` \\\n  -H '${key}: ${escapedValue}'`;
        }
    }
    
    // Note: Body will be shown separately for better readability
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        curl += ` \\\n  -d @-  # See Request Body below`;
    }
    
    return curl;
}

// Add entry to debug log
function addDebugLog(type, title, data) {
    const entry = document.createElement('div');
    entry.className = `debug-entry ${type}`;
    
    const time = document.createElement('div');
    time.className = 'debug-entry-time';
    time.textContent = new Date().toLocaleTimeString();
    entry.appendChild(time);
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'debug-entry-title';
    titleDiv.textContent = title;
    entry.appendChild(titleDiv);
    
    const content = document.createElement('div');
    content.className = 'debug-entry-content';
    
    let contentText = '';
    if (typeof data === 'string') {
        contentText = data;
    } else if (data && typeof data === 'object') {
        // Check if this is an API request/response that should be formatted as cURL
        if (data.method && data.url) {
            const masked = maskSensitiveData(data);
            const headers = masked.headers || {};
            const body = masked.body;
            
            // Create masked headers for display
            const maskedHeaders = {};
            if (data.headers) {
                for (const [key, value] of Object.entries(data.headers)) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.includes('apikey') || lowerKey.includes('api_key') || 
                        lowerKey.includes('token') || lowerKey.includes('password') ||
                        lowerKey.includes('secret') || lowerKey.includes('auth')) {
                        maskedHeaders[key] = '***MASKED***';
                    } else {
                        maskedHeaders[key] = value;
                    }
                }
            }
            
            contentText = formatAsCurl(data.method, data.url, data.headers, null, maskedHeaders);
            
            // Add request body separately for better readability
            if (body && (data.method === 'POST' || data.method === 'PUT' || data.method === 'PATCH')) {
                const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
                contentText += `\n\n# Request Body:\n${bodyStr}`;
            }
            
            // Add response info if available
            if (data.status || data.statusText) {
                contentText += `\n\n# Response: ${data.status || ''} ${data.statusText || ''}`;
            }
            
            // Add response data if available (for both response and error types)
            if (data.data && (type === 'response' || type === 'error')) {
                const responseBody = maskSensitiveData(data.data);
                contentText += `\n\n# Response Body:\n${JSON.stringify(responseBody, null, 2)}`;
            }
            
            // Also show error field if present (for error types)
            if (data.error && type === 'error') {
                contentText += `\n\n# Error: ${data.error}`;
            }
        } else {
            // Regular object, format as JSON
            const masked = maskSensitiveData(data);
            contentText = JSON.stringify(masked, null, 2);
        }
    }
    content.textContent = contentText;
    entry.appendChild(content);
    
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
}

// Clear debug log
function clearDebugLog() {
    debugLog.innerHTML = '';
}

// Extract conversation state from response (handles both data array and direct formats)
function getConversationState(response) {
    if (!response?.json?.default) {
        return null;
    }

    const responseData = response.json.default;
    
    // Check data array format: json.default.data[0].state
    if (responseData.data && Array.isArray(responseData.data) && responseData.data.length > 0) {
        const firstDataItem = responseData.data[0];
        if (firstDataItem.state) {
            return firstDataItem.state;
        }
    }
    
    // Fallback to direct format: json.default.state
    if (responseData.state) {
        return responseData.state;
    }
    
    return null;
}

// Check if conversation is in a terminal state (matches backend logic)
// Polling should stop when state is OK, ERROR, or PARTIAL_OK
// Polling should continue when state is RUNNING
function isTerminalState(pollResponse) {
    const state = getConversationState(pollResponse);
    
    if (!state) {
        return false;
    }
    
    // Terminal states: OK, ERROR, PARTIAL_OK
    // Continue polling: RUNNING
    return state === 'OK' || state === 'ERROR' || state === 'PARTIAL_OK';
}

// Poll until conversation reaches a terminal state (OK, ERROR, or PARTIAL_OK)
async function pollUntilComplete(executionId, sessionId) {
    const maxPollAttempts = 100;
    const pollInterval = 5000; // 5 seconds
    let pollAttempts = 0;
    
    // Build the actual API URL for logging
    const apiUrl = `${settings.baseUrl}/${settings.chatWorkflowId}/${settings.chatWorkflowVersion}/invoke`;
    const pollPayload = {
        data: {
            default: [{
                sessionId: sessionId,
                id: executionId,
                mode: 'POLL_REQUEST'
            }]
        }
    };

    while (pollAttempts < maxPollAttempts) {
        // Wait before polling (except on first attempt - poll immediately)
        if (pollAttempts > 0) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
        
        pollAttempts++;
        
        // Log poll request as cURL
        addDebugLog('request', `POST Poll (Attempt ${pollAttempts})`, {
            method: 'POST',
            url: apiUrl,
            headers: {
                'Content-Type': 'application/json',
                'api-key': settings.chatApiKey
            },
            body: pollPayload
        });

        try {
            const response = await fetch('/api/poll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: sessionId,
                    executionId: executionId,
                    settings: settings,
                }),
            });

            const data = await response.json();

            // Log poll response
            if (response.ok) {
                addDebugLog('response', `Poll Response ${response.status} (Attempt ${pollAttempts})`, {
                    method: 'POST',
                    url: apiUrl,
                    status: response.status,
                    statusText: response.statusText,
                    data: data
                });

                // Check conversation state (not execution states)
                // Handles both data array format and direct format
                const state = getConversationState(data);
                
                // Stop polling when we reach a terminal state
                if (isTerminalState(data)) {
                    addDebugLog('info', 'Polling Complete - Terminal State Reached', {
                        message: `Conversation reached terminal state '${state}' after ${pollAttempts} polling attempt(s)`,
                        state: state,
                        totalAttempts: pollAttempts
                    });
                    
                    // Extract and display the final message if state is OK
                    const responseData = data.json?.default;
                    addDebugLog('info', 'Final Response', responseData);
                    
                    let finalMessage = null;
                    let isOK = false;
                    
                    // Check data array format: json.default.data[0].message and json.default.data[0].state
                    if (responseData.data && Array.isArray(responseData.data) && responseData.data.length > 0) {
                        const firstDataItem = responseData.data[0];
                        if (firstDataItem.state === 'OK') {
                            isOK = true;
                            finalMessage = firstDataItem.message || null;
                        }
                    }
                    
                    // Check direct format: json.default.message and json.default.state
                    if (!isOK && responseData?.state === 'OK') {
                        isOK = true;
                        // For poll responses, message might be in logs array
                        finalMessage = responseData.message || 
                                      (responseData.logs && responseData.logs.length > 0 
                                        ? responseData.logs.join('\n') 
                                        : null);
                    }
                    
                    // Display the message in the chat interface if state is OK and message exists
                    if (isOK && finalMessage) {
                        addMessage(finalMessage, 'assistant');
                    } else if (state === 'ERROR') {
                        // Display error message
                        const errorMsg = responseData.logs?.join('\n') || 
                                       data.errorMessages || 
                                       'Request failed';
                        addMessage(`Error: ${errorMsg}`, 'error');
                    } else if (state === 'PARTIAL_OK') {
                        // Display partial result message
                        const partialMsg = responseData.message || 
                                         (responseData.logs && responseData.logs.length > 0 
                                           ? responseData.logs.join('\n') 
                                           : 'Partial results available');
                        addMessage(partialMsg, 'assistant');
                    }
                    
                    return data;
                }

                // If still RUNNING, continue polling
                if (state === 'RUNNING') {
                    addDebugLog('debug', 'Poll Response Still RUNNING', {
                        message: `State is still RUNNING, continuing polling (attempt ${pollAttempts})`,
                        state: state,
                        attempt: pollAttempts
                    });
                    continue;
                }

                // Unexpected state - log warning and continue
                addDebugLog('warn', 'Unexpected State in Poll Response', {
                    message: `Unexpected state '${state}', continuing polling`,
                    state: state,
                    attempt: pollAttempts
                });
            } else {
                addDebugLog('error', `Poll Error ${response.status} (Attempt ${pollAttempts})`, {
                    method: 'POST',
                    url: apiUrl,
                    status: response.status,
                    statusText: response.statusText,
                    error: data.error || 'Unknown error',
                    data: data
                });
                throw new Error(data.error || 'Polling failed');
            }
        } catch (error) {
            addDebugLog('error', `Poll Exception (Attempt ${pollAttempts})`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Max attempts reached
    addDebugLog('error', 'Polling Timeout', {
        message: `Maximum polling attempts (${maxPollAttempts}) reached`,
        totalAttempts: pollAttempts
    });
    throw new Error('Polling timeout: Maximum attempts reached');
}

// Add message to chat
function addMessage(text, type = 'assistant', timestamp = new Date()) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const textDiv = document.createElement('div');
    textDiv.textContent = text;
    messageDiv.appendChild(textDiv);
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = timestamp.toLocaleTimeString();
    messageDiv.appendChild(timeDiv);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageDiv;
}

// Update message content (for streaming/thinking)
function updateMessage(messageDiv, text) {
    const textDiv = messageDiv.querySelector('div:first-child');
    if (textDiv) {
        textDiv.textContent = text;
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Connect to SSE (Server-Sent Events) for real-time updates
async function connectSSE(sessionId) {
    // Close existing connection
    if (currentSSEConnection) {
        currentSSEConnection.abort();
        currentSSEConnection = null;
    }

    if (!settings.chatWorkflowId || !settings.socketBaseUrl || !settings.chatApiKey) {
        addDebugLog('error', 'SSE Connection Failed', 'Missing workflow ID, socket base URL, or API key');
        return;
    }

    try {
        // Construct SSE URL: POST {socketBaseUrl}/{workflowId}/{sessionId}
        // socketBaseUrl should already include /workflow-chat
        const sseUrl = `${settings.socketBaseUrl}/${settings.chatWorkflowId}/${sessionId}`;

        // Log SSE connection as cURL
        addDebugLog('websocket', 'POST SSE Connection', {
            method: 'POST',
            url: sseUrl,
            headers: {
                'Content-Type': 'application/json',
                'api-key': settings.chatApiKey,
                'Accept': 'text/event-stream'
            },
            body: {}
        });

        const abortController = new AbortController();
        currentSSEConnection = abortController;

        // Prepare headers with API key
        const headers = {
            'Content-Type': 'application/json',
            'api-key': settings.chatApiKey,
            'Accept': 'text/event-stream',
        };

        // Make POST request to initiate SSE stream
        const response = await fetch(sseUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({}), // Empty body for POST
            signal: abortController.signal,
        });

        if (!response.ok) {
            addDebugLog('error', `SSE Connection Failed ${response.status}`, {
                method: 'POST',
                url: sseUrl,
                status: response.status,
                statusText: response.statusText
            });
            currentSSEConnection = null;
            return;
        }

        addDebugLog('websocket', `SSE Connected ${response.status}`, {
            method: 'POST',
            url: sseUrl,
            status: response.status,
            statusText: response.statusText
        });

        let thinkingMessageDiv = null;

        // Helper function to handle socket messages (scoped to this connection)
        const handleSocketMessage = (message) => {
            const { types, message: msg } = message;

            // Handle thinking messages
            if (types.includes('AGENT_THINKING') || types.includes('AGENT_STARTED')) {
                if (!thinkingMessageDiv) {
                    thinkingMessageDiv = addMessage(msg || 'Agent is thinking...', 'thinking');
                } else {
                    updateMessage(thinkingMessageDiv, msg || 'Agent is thinking...');
                }
            }

            // Handle content updates
            if (types.includes('CONTENT_DELTA') || types.includes('CONTENT_COMPLETE')) {
                if (thinkingMessageDiv) {
                    // Replace thinking message with actual content
                    thinkingMessageDiv.className = 'message assistant';
                    updateMessage(thinkingMessageDiv, msg);
                } else {
                    addMessage(msg, 'assistant');
                }
            }

            // Handle final result
            if (types.includes('FINAL_RESULT') || types.includes('AGENT_COMPLETED')) {
                if (thinkingMessageDiv) {
                    thinkingMessageDiv.className = 'message assistant';
                    updateMessage(thinkingMessageDiv, msg || 'Request completed');
                    thinkingMessageDiv = null;
                } else if (msg) {
                    addMessage(msg, 'assistant');
                }
            }

            // Handle errors
            if (types.includes('ERROR') || types.includes('AGENT_FAILED')) {
                if (thinkingMessageDiv) {
                    thinkingMessageDiv.className = 'message error';
                    updateMessage(thinkingMessageDiv, `Error: ${msg || 'Request failed'}`);
                    thinkingMessageDiv = null;
                } else {
                    addMessage(`Error: ${msg || 'Request failed'}`, 'error');
                }
            }

            // Handle execution updates
            if (types.includes('EXECUTION_CALL_STARTED') || types.includes('EXECUTION_CALL_RESULT')) {
                if (msg && thinkingMessageDiv) {
                    updateMessage(thinkingMessageDiv, `Processing: ${msg}`);
                }
            }

            // Handle progress updates
            if (types.includes('PROGRESS_UPDATE')) {
                if (msg && thinkingMessageDiv) {
                    updateMessage(thinkingMessageDiv, `Progress: ${msg}`);
                }
            }
        };

        // Parse SSE stream manually
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Process SSE stream
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                // Stream ended
                addDebugLog('websocket', 'SSE Connection Closed', {
                    sessionId: sessionId,
                    reason: 'Stream ended'
                });
                currentSSEConnection = null;
                break;
            }

            // Decode chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages (lines ending with \n\n)
            let eventEndIndex;
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
                    addDebugLog('websocket', 'SSE Connection Confirmed', {
                        sessionId: sessionId,
                        data: eventData
                    });
                    continue;
                }

                // Parse message data
                if (eventData) {
                    try {
                        const message = JSON.parse(eventData);
                        addDebugLog('websocket', 'SSE Message Received', message);
                        handleSocketMessage(message);
                    } catch (error) {
                        console.error('Failed to parse SSE message:', error);
                        addDebugLog('error', 'SSE Parse Error', {
                            error: error.message,
                            rawData: eventData.substring(0, 200)
                        });
                    }
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            addDebugLog('websocket', 'SSE Connection Aborted', {
                sessionId: sessionId
            });
        } else {
            console.error('Failed to connect SSE:', error);
            addDebugLog('error', 'SSE Connection Error', {
                error: error.message || 'Unknown error',
                sessionId: sessionId
            });
        }
        currentSSEConnection = null;
    }
}


// Send chat message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        return;
    }

    if (!validateSettings()) {
        alert('Please configure your settings first. Click the Settings button.');
        settingsBtn.click();
        return;
    }

    // Disable input while sending
    sendBtn.disabled = true;
    messageInput.disabled = true;

    // Add user message to chat
    addMessage(message, 'user');
    messageInput.value = '';

    // Connect to SSE for real-time updates
    connectSSE(currentSessionId);

    // Build the actual API URL for logging
    const apiUrl = `${settings.baseUrl}/${settings.chatWorkflowId}/${settings.chatWorkflowVersion}/invoke`;
    const requestPayload = {
        data: {
            default: [{
                sessionId: currentSessionId,
                message: message,
                mode: 'CHAT_REQUEST'
            }]
        }
    };

    // Log request as cURL
    addDebugLog('request', 'POST Initiate Conversation', {
        method: 'POST',
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json',
            'api-key': settings.chatApiKey
        },
        body: requestPayload
    });

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                sessionId: currentSessionId,
                settings,
            }),
        });

        const data = await response.json();

        // Log response
        if (response.ok) {
            addDebugLog('response', `Response ${response.status} ${response.statusText}`, {
                method: 'POST',
                url: apiUrl,
                status: response.status,
                statusText: response.statusText,
                data: data
            });
        } else {
            addDebugLog('error', `Error ${response.status} ${response.statusText}`, {
                method: 'POST',
                url: apiUrl,
                status: response.status,
                statusText: response.statusText,
                error: data.error || 'Unknown error',
                data: data
            });
        }

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send message');
        }

        // Handle response
        if (data.json && data.json.default) {
            const responseData = data.json.default;
            
            // Extract state and executionId (handles both data array and direct formats)
            let state = null;
            let executionId = null;
            
            // Check data array format: json.default.data[0].state and json.default.data[0].id
            if (responseData.data && Array.isArray(responseData.data) && responseData.data.length > 0) {
                const firstDataItem = responseData.data[0];
                state = firstDataItem.state || null;
                executionId = firstDataItem.id || null;
            }
            
            // Fallback to direct format: json.default.state and json.default.id
            if (!state) {
                state = responseData.state || null;
                executionId = responseData.id || null;
            }
            
            // Log the detected state and executionId for debugging
            addDebugLog('debug', 'Response State Detection', {
                state: state,
                executionId: executionId,
                hasDataArray: !!(responseData.data && Array.isArray(responseData.data) && responseData.data.length > 0),
                directState: responseData.state,
                directId: responseData.id
            });
            
            // Check if we need to poll (state is RUNNING and we have an execution ID)
            // This matches the backend behavior: when state is RUNNING with an id, we need to poll
            if (state === 'RUNNING' && executionId) {
                addDebugLog('info', 'Starting Polling', {
                    message: `Conversation state is RUNNING with execution ID. Starting polling every 5 seconds.`,
                    executionId: executionId,
                    state: state
                });
                
                // Start polling (will poll immediately on first attempt, then every 5 seconds)
                await pollUntilComplete(executionId, currentSessionId);
            } else if (state && state !== 'RUNNING') {
                // Log when we don't start polling because state is not RUNNING
                addDebugLog('info', 'Skipping Polling', {
                    message: `Conversation state is '${state}', not RUNNING. Polling not needed.`,
                    state: state,
                    executionId: executionId
                });
            }
            
            // Check for screen responses
            if (responseData.mode === 'SCREEN_RESPONSE' && responseData.screens) {
                const screen = responseData.screens[0];
                addMessage(
                    `Screen response: ${screen.asset.message} (Type: ${screen.asset.type})`,
                    'assistant'
                );
            } else if (responseData.message) {
                // Regular response - SSE should have already handled it
                // But add it here as fallback if SSE didn't work
                if (!currentSSEConnection) {
                    addMessage(responseData.message, 'assistant');
                }
            }

            // Show executions if any
            if (responseData.executions && responseData.executions.length > 0) {
                responseData.executions.forEach((exec) => {
                    if (exec.response) {
                        addMessage(`Execution: ${exec.response} (${exec.type})`, 'assistant');
                    }
                });
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        addDebugLog('error', 'Request Exception', {
            error: error.message,
            stack: error.stack
        });
        addMessage(`Error: ${error.message}`, 'error');
    } finally {
        // Re-enable input
        sendBtn.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('show');
    updateSettingsUI();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
});

cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
});

saveSettingsBtn.addEventListener('click', () => {
    loadSettingsFromForm();
    saveSettings();
    settingsModal.classList.remove('show');
    
    // Generate new session ID when settings change
    currentSessionId = `session-${Date.now()}`;
    
    alert('Settings saved!');
});

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
    }
});

// Debug panel event listeners
toggleDebugBtn.addEventListener('click', () => {
    debugPanel.classList.toggle('collapsed');
    const isCollapsed = debugPanel.classList.contains('collapsed');
    toggleDebugBtn.textContent = isCollapsed ? '▶' : '◀';
    toggleDebugBtn.title = isCollapsed ? 'Expand Debug Panel' : 'Collapse Debug Panel';
});

clearDebugBtn.addEventListener('click', () => {
    if (confirm('Clear all debug log entries?')) {
        clearDebugLog();
    }
});

// Initialize
loadSettings();
messageInput.focus();
addDebugLog('info', 'Application Started', 'Debug log initialized');

