export type AgentMessage = {
  type: string;
  subtype?: string;
  result?: string;
  [key: string]: unknown;
};

export type AgentOptions = {
  maxTurns?: number;
  cwd?: string;
  timeout?: number;
  outputSchema?: Record<string, unknown>;
};

export interface AgentAdapter {
  query(prompt: string, options?: AgentOptions): AsyncIterable<AgentMessage>;
}
