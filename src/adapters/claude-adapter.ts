import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter, AgentMessage, AgentOptions } from "./agent-adapter";

export class ClaudeAdapter implements AgentAdapter {
  async *query(prompt: string, options?: AgentOptions): AsyncIterable<AgentMessage> {
    for await (const message of query({
      prompt,
      options: {
        maxTurns: options?.maxTurns,
        cwd: options?.cwd,
      },
    })) {
      yield this.mapMessage(message);
    }
  }

  private mapMessage(message: SDKMessage): AgentMessage {
    const mapped: AgentMessage = {
      ...message,
      type: message.type,
    };
    
    if (message.type === "result" && "subtype" in message && "result" in message) {
      mapped.subtype = message.subtype;
      mapped.result = message.result;
    }
    
    return mapped;
  }
}
