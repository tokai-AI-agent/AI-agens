export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function callAgent(agentId: string, messages: AgentMessage[]): Promise<string> {
  const response = await fetch(`/api/agents/${agentId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}${errorText ? `\n${errorText}` : ''}`);
  }

  const data = await response.json();
  return (
    data.text ??
    data.object?.text ??
    data.content ??
    data.message ??
    JSON.stringify(data, null, 2)
  );
}

// Mastraの `structuredOutput` を使い、テキストではなくJSON Schemaに沿ったオブジェクトを取得する。
export async function callAgentStructured<T>(
  agentId: string,
  messages: AgentMessage[],
  schema: unknown,
): Promise<T> {
  const response = await fetch(`/api/agents/${agentId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, structuredOutput: { schema } }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}${errorText ? `\n${errorText}` : ''}`);
  }

  const data = await response.json();
  if (data.object === undefined) {
    throw new Error(`Structured output missing from response\n${JSON.stringify(data, null, 2)}`);
  }
  return data.object as T;
}
