import {
  JivaPublicApiClient,
  extractWorkflowErrors,
  fileToBase64,
  hasWorkflowError,
  isWorkflowComplete,
} from '../client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('JivaPublicApiClient', () => {
  it('invokes a workflow synchronously', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        workflowExecutionId: 'exec-1',
        strings: { result: 'done' },
      })
    );

    const client = new JivaPublicApiClient({
      apiKey: 'test-key',
      workflowId: 'workflow-1',
      fetchImpl,
    });

    const result = await client.invokeWorkflow({
      strings: { message: 'hello' },
    });

    expect(result.strings?.result).toBe('done');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.jiva.ai/public-api/workflow/workflow-1/invoke',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': 'test-key',
        },
        body: JSON.stringify({ strings: { message: 'hello' } }),
      })
    );
  });

  it('starts async invocation and polls until complete', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          workflowId: 'workflow-1',
          workflowExecutionId: 'exec-1',
          errorMessages: {},
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          workflowExecutionId: 'exec-1',
          inProgressMessages: { 'In Progress': ['Workflow currently executing.'] },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          workflowExecutionId: 'exec-1',
          json: { result: { ok: true } },
        })
      );

    const client = new JivaPublicApiClient({
      apiKey: 'test-key',
      workflowId: 'workflow-1',
      fetchImpl,
    });

    const result = await client.invokeWorkflowAndWait(
      { json: { input: { value: 1 } } },
      { intervalMs: 1, timeoutMs: 1000 }
    );

    expect(result.json?.result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.jiva.ai/public-api/workflow/workflow-1/invoke-async',
      expect.any(Object)
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.jiva.ai/public-api/workflow/workflow-1/exec-1/invoke-async-response',
      expect.any(Object)
    );
  });

  it('supports workflow phase URLs', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ data: {} }));
    const client = new JivaPublicApiClient({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.invokeWorkflow(
      { data: { input: [{ value: 1 }] } },
      { workflowId: 'parent-1', workflowPhase: 2 }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.jiva.ai/public-api/workflow/parent-1/2/invoke',
      expect.any(Object)
    );
  });

  it('exposes workflow status helpers', () => {
    expect(
      isWorkflowComplete({
        workflowExecutionId: 'exec-1',
        inProgressMessages: { 'In Progress': ['Workflow currently executing.'] },
      })
    ).toBe(false);
    expect(isWorkflowComplete({ workflowExecutionId: 'exec-1', data: {} })).toBe(true);
    expect(hasWorkflowError({ errorMessages: { Error: ['failed'] } })).toBe(true);
    expect(extractWorkflowErrors({ errorMessages: { Error: ['failed'] } })).toEqual([
      'Error: failed',
    ]);
  });

  it('converts binary file inputs to base64', async () => {
    await expect(fileToBase64(new Uint8Array([104, 105]))).resolves.toBe('aGk=');
  });
});
