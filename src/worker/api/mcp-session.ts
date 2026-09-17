export class MCPError extends Error {
  constructor(message: string, readonly authRequired = false) { super(message); }
}

type RPC = { jsonrpc?: string; id?: number; result?: any; error?: { message?: string } };

// Keep the offending body visible: MCP servers behind auth pages or proxies
// often return HTML with a JSON content type.
function parseJson(text: string): RPC {
  try { return JSON.parse(text); } catch {
    throw new MCPError(`MCP server returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// Streamable HTTP may reply with JSON or a long-lived SSE stream. Stop when
// the matching result arrives rather than awaiting the end of the SSE stream.
async function readResult(response: Response, id: number): Promise<any> {
  const type = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  if (!reader) throw new MCPError('MCP server returned an empty response');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  const result = (rpc: RPC) => {
    if (rpc.jsonrpc !== '2.0' || rpc.id !== id) throw new MCPError('Invalid MCP response');
    if (rpc.error) throw new MCPError(`MCP error: ${rpc.error.message || 'Request failed'}`);
    if (!rpc.result || typeof rpc.result !== 'object') throw new MCPError('MCP result is missing');
    return rpc.result;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        size += value.byteLength;
        if (size > 2_000_000) throw new MCPError('MCP response is too large');
      }
      text += decoder.decode(value, { stream: !done });
      if (type.includes('text/event-stream')) {
        // Normalize CRLF after decoding, including CRLF split across chunks.
        text = text.replace(/\r\n/g, '\n');
        let end: number;
        while ((end = text.indexOf('\n\n')) !== -1 || (done && text.length > 0)) {
          if (end === -1) end = text.length;
          const event = text.slice(0, end);
          text = text.slice(end + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (!data) continue;
          const rpc = parseJson(data);
          if (rpc.id === id) return result(rpc);
        }
      } else if (done) {
        if (!type.includes('application/json')) throw new MCPError('MCP endpoint must support Streamable HTTP (JSON or SSE replies)');
        return result(parseJson(text));
      }
      if (done) throw new MCPError('MCP stream ended without a matching response');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function createMCPSession(url: URL, accessToken: string | null, signal: AbortSignal) {
    let sessionId: string | null = null;
    let version: string | null = null;
    let id = 0;
    const request = async (method: string, params?: unknown, notification = false) => {
      const requestId = notification ? undefined : ++id;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      };
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      if (version) headers['MCP-Protocol-Version'] = version;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetch(url.toString(), {
        method: 'POST', headers,
        // Workers' fetch rejects redirect:"error"; use "manual" so an MCP
        // endpoint that redirects to an HTML login page is a visible error
        // instead of silently following it.
        redirect: 'manual', signal: signal,
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: requestId }), method, ...(params === undefined ? {} : { params }) }),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new MCPError(`MCP endpoint redirected (HTTP ${response.status} to ${response.headers.get('Location') ?? 'unknown'}) — the URL may be wrong or the session expired. Open the URL directly to check.`);
      }
      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 300);
        if (response.status === 405) {
          throw new MCPError(`MCP endpoint answered HTTP 405 — it does not accept POST (Streamable HTTP). Check the MCP URL. ${body}`);
        }
        throw new MCPError(`MCP server returned HTTP ${response.status}: ${body || '(no body)'}`, response.status === 401);
      }
      if (notification) { await response.body?.cancel(); return; }
      if (method === 'initialize') sessionId = response.headers.get('Mcp-Session-Id');
      return readResult(response, requestId!);
    };
    const initialized = await request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'easywebui', version: '1.0.0' },
    });
    if (!['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(initialized.protocolVersion)) {
      throw new MCPError('Unsupported MCP protocol version');
    }
    version = initialized.protocolVersion;
    await request('notifications/initialized', undefined, true);
    return { request, initialized };
}
