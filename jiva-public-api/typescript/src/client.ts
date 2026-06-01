import {
  FileInput,
  InvokeWorkflowRequest,
  InvokeWorkflowResponse,
  InvokeWorkflowResponseAsync,
  JivaPublicApiClientConfig,
  RequestOptions,
  WaitForWorkflowResultOptions,
  WorkflowTarget,
} from './types';

const DEFAULT_BASE_URL = 'https://api.jiva.ai/public-api';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;

export class JivaPublicApiError extends Error {
  public readonly status?: number;
  public readonly response?: unknown;

  constructor(message: string, status?: number, response?: unknown) {
    super(message);
    this.name = 'JivaPublicApiError';
    this.status = status;
    this.response = response;
  }
}

export class JivaPublicApiClient {
  private readonly apiKey: string;
  private readonly workflowId?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: JivaPublicApiClientConfig) {
    if (!config.apiKey) {
      throw new JivaPublicApiError('apiKey is required');
    }

    const fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new JivaPublicApiError(
        'fetch is not available. Provide fetchImpl or use a runtime with fetch support.'
      );
    }

    this.apiKey = config.apiKey;
    this.workflowId = config.workflowId;
    this.baseUrl = trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async invokeWorkflow(
    request: InvokeWorkflowRequest,
    options: RequestOptions = {}
  ): Promise<InvokeWorkflowResponse> {
    return this.postJson<InvokeWorkflowResponse>(
      this.workflowPath('invoke', options),
      request,
      options.signal
    );
  }

  async invokeWorkflowAsync(
    request: InvokeWorkflowRequest,
    options: RequestOptions = {}
  ): Promise<InvokeWorkflowResponseAsync> {
    return this.postJson<InvokeWorkflowResponseAsync>(
      this.workflowPath('invoke-async', options),
      request,
      options.signal
    );
  }

  async getWorkflowResult(
    workflowExecutionId: string,
    options: RequestOptions = {}
  ): Promise<InvokeWorkflowResponse> {
    if (!workflowExecutionId) {
      throw new JivaPublicApiError('workflowExecutionId is required');
    }

    return this.postJson<InvokeWorkflowResponse>(
      `${this.workflowBasePath(options)}/${encodeURIComponent(
        workflowExecutionId
      )}/invoke-async-response`,
      undefined,
      options.signal
    );
  }

  async waitForWorkflowResult(
    workflowExecutionId: string,
    options: WaitForWorkflowResultOptions = {}
  ): Promise<InvokeWorkflowResponse> {
    const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    let lastResponse: InvokeWorkflowResponse | undefined;

    while (Date.now() - startedAt <= timeoutMs) {
      const response = await this.getWorkflowResult(workflowExecutionId, options);
      lastResponse = response;
      if (isWorkflowComplete(response)) {
        return response;
      }

      await delay(intervalMs, options.signal);
    }

    throw new JivaPublicApiError(
      `Timed out waiting for workflow result after ${timeoutMs}ms`,
      undefined,
      lastResponse
    );
  }

  async invokeWorkflowAndWait(
    request: InvokeWorkflowRequest,
    options: WaitForWorkflowResultOptions = {}
  ): Promise<InvokeWorkflowResponse> {
    const started = await this.invokeWorkflowAsync(request, options);
    if (hasWorkflowError(started)) {
      throw new JivaPublicApiError(
        'Workflow invocation returned errorMessages',
        undefined,
        started
      );
    }

    if (!started.workflowExecutionId) {
      throw new JivaPublicApiError(
        'Workflow invocation did not return workflowExecutionId',
        undefined,
        started
      );
    }

    return this.waitForWorkflowResult(started.workflowExecutionId, options);
  }

  async buildBase64FileBytes(
    files: Record<string, FileInput>
  ): Promise<Record<string, string>> {
    const entries = await Promise.all(
      Object.entries(files).map(async ([key, file]) => [key, await fileToBase64(file)] as const)
    );
    return Object.fromEntries(entries);
  }

  async buildBase64MultiFileBytes(
    files: Record<string, FileInput[]>
  ): Promise<Record<string, string[]>> {
    const entries = await Promise.all(
      Object.entries(files).map(async ([key, values]) => [
        key,
        await Promise.all(values.map(fileToBase64)),
      ] as const)
    );
    return Object.fromEntries(entries);
  }

  private workflowPath(action: 'invoke' | 'invoke-async', target: WorkflowTarget): string {
    return `${this.workflowBasePath(target)}/${action}`;
  }

  private workflowBasePath(target: WorkflowTarget): string {
    const workflowId = target.workflowId ?? this.workflowId;
    if (!workflowId) {
      throw new JivaPublicApiError(
        'workflowId is required. Pass it in the client config or method options.'
      );
    }

    const encodedWorkflowId = encodeURIComponent(workflowId);
    if (target.workflowPhase === undefined) {
      return `/workflow/${encodedWorkflowId}`;
    }

    return `/workflow/${encodedWorkflowId}/${encodeURIComponent(String(target.workflowPhase))}`;
  }

  private async postJson<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

    const text = await response.text();
    const parsed = text ? parseJson(text) : undefined;

    if (!response.ok) {
      throw new JivaPublicApiError(
        errorMessageFromResponse(parsed) ?? `HTTP ${response.status}`,
        response.status,
        parsed
      );
    }

    return parsed as T;
  }
}

export function isWorkflowComplete(response: InvokeWorkflowResponse): boolean {
  if (hasWorkflowError(response)) {
    return true;
  }

  return Boolean(
    response.data ||
      response.strings ||
      response.base64Files ||
      response.base64MultiFiles ||
      response.json ||
      response.vectorDatabaseIndexIds ||
      response.metadata
  );
}

export function hasWorkflowError(
  response: Pick<InvokeWorkflowResponse, 'errorMessages'> | InvokeWorkflowResponseAsync
): boolean {
  return hasKeys(response.errorMessages);
}

export function extractWorkflowErrors(
  response: Pick<InvokeWorkflowResponse, 'errorMessages'> | InvokeWorkflowResponseAsync
): string[] {
  return Object.entries(response.errorMessages ?? {}).flatMap(([key, messages]) =>
    messages.map((message) => `${key}: ${message}`)
  );
}

export async function fileToBase64(file: FileInput): Promise<string> {
  if (isBlob(file)) {
    return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  }

  if (file instanceof ArrayBuffer) {
    return bytesToBase64(new Uint8Array(file));
  }

  return bytesToBase64(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));
}

function hasKeys(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromResponse(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const record = response as Record<string, unknown>;
  return typeof record.message === 'string'
    ? record.message
    : typeof record.error === 'string'
      ? record.error
      : undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      { once: true }
    );
  });
}

function isBlob(value: FileInput): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
