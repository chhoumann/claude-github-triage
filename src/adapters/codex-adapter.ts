import { Codex } from "@openai/codex-sdk";
import type { AgentAdapter, AgentMessage, AgentOptions } from "./agent-adapter";

export class CodexAdapter implements AgentAdapter {
  private codex: Codex;

  constructor() {
    this.codex = new Codex();
  }

  async *query(prompt: string, options?: AgentOptions): AsyncIterable<AgentMessage> {
    const thread = this.codex.startThread({
      workingDirectory: options?.cwd,
      skipGitRepoCheck: true,
    });

    const turn = await thread.run(prompt, {
      outputSchema: options?.outputSchema,
    });

    for (const item of turn.items) {
      yield {
        type: "item",
        subtype: "completed",
        item,
      };
    }

    yield {
      type: "result",
      subtype: "success",
      result: turn.finalResponse,
      usage: turn.usage,
    };
  }
}
