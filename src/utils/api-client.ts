// API Client for D1 Database Operations
// This replaces LocalStorage as the master data source

const API_BASE = '';

export async function fetchConversations() {
  const response = await fetch(`${API_BASE}/api/conversations`);
  if (!response.ok) throw new Error('Failed to fetch conversations');
  return response.json();
}

export async function saveConversation(conversation: any) {
  const response = await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversation),
  });
  if (!response.ok) throw new Error('Failed to save conversation');
  return response.json();
}

export async function updateConversation(id: string, updates: any) {
  const response = await fetch(`${API_BASE}/api/conversations?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update conversation');
  return response.json();
}

export async function deleteConversation(id: string) {
  const response = await fetch(`${API_BASE}/api/conversations?id=${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete conversation');
  return response.json();
}

export async function fetchMemoryFacts() {
  const response = await fetch(`${API_BASE}/api/memory/facts`);
  if (!response.ok) throw new Error('Failed to fetch memory facts');
  return response.json();
}

export async function addMemoryFact(fact: any) {
  const response = await fetch(`${API_BASE}/api/memory/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fact),
  });
  if (!response.ok) throw new Error('Failed to add memory fact');
  return response.json();
}

export async function deleteMemoryFact(id: string) {
  const response = await fetch(`${API_BASE}/api/memory/facts?id=${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete memory fact');
  return response.json();
}

export async function fetchSummaries() {
  const response = await fetch(`${API_BASE}/api/memory/summaries`);
  if (!response.ok) throw new Error('Failed to fetch summaries');
  return response.json();
}

export async function addSummary(summary: any) {
  const response = await fetch(`${API_BASE}/api/memory/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  });
  if (!response.ok) throw new Error('Failed to add summary');
  return response.json();
}

export async function fetchMCPServers() {
  const response = await fetch(`${API_BASE}/api/mcp-servers`);
  if (!response.ok) throw new Error('Failed to fetch MCP servers');
  return response.json();
}

export async function addMCPServer(server: any) {
  const response = await fetch(`${API_BASE}/api/mcp-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!response.ok) throw new Error('Failed to add MCP server');
  return response.json();
}

export async function updateMCPServer(id: string, updates: any) {
  const response = await fetch(`${API_BASE}/api/mcp-servers?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update MCP server');
  return response.json();
}

export async function deleteMCPServer(id: string) {
  const response = await fetch(`${API_BASE}/api/mcp-servers?id=${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete MCP server');
  return response.json();
}

export async function fetchEndpoints() {
  const response = await fetch(`${API_BASE}/api/endpoints`);
  if (!response.ok) throw new Error('Failed to fetch endpoints');
  return response.json();
}

export async function addEndpoint(endpoint: any) {
  const response = await fetch(`${API_BASE}/api/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
  if (!response.ok) throw new Error('Failed to add endpoint');
  return response.json();
}

export async function updateEndpoint(id: string, updates: any) {
  const response = await fetch(`${API_BASE}/api/endpoints?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update endpoint');
  return response.json();
}

export async function deleteEndpoint(id: string) {
  const response = await fetch(`${API_BASE}/api/endpoints?id=${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete endpoint');
  return response.json();
}

// Settings API (new)
export async function fetchSettings() {
  const response = await fetch(`${API_BASE}/api/settings`);
  if (!response.ok) throw new Error('Failed to fetch settings');
  return response.json();
}

export async function saveSettings(settings: any) {
  const response = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error('Failed to save settings');
  return response.json();
}
export async function connectMCPServer(serverId: string) {
  const response = await fetch('/api/mcp-servers/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId }),
  });
  const data = await response.json() as {
    error?: string; authRequired?: boolean; status: 'connected';
    tools: import('../types').MCPTool[]; lastChecked: number;
  };
  if (!response.ok) throw Object.assign(new Error(data.error || 'Failed to connect MCP server'), { authRequired: data.authRequired });
  return data;
}
export async function callMCPTool(serverId: string, name: string, args: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
  const response = await fetch('/api/mcp-servers/call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId, name, arguments: args }),
  });
  const data = await response.json() as { error?: string; content: string; isError: boolean };
  if (!response.ok) throw new Error(data.error || 'MCP tool call failed');
  if (typeof data.content !== 'string' || typeof data.isError !== 'boolean') throw new Error('Invalid MCP tool result');
  return data;
}
