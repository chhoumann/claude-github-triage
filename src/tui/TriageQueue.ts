import { EventEmitter } from "events";
import type { TriageRunOptions } from "../issue-triager";

export type TriageQueueEvent =
  | { type: "queued"; issueNumber: number }
  | { type: "started"; issueNumber: number }
  | { type: "success"; issueNumber: number; elapsedMs: number }
  | { type: "error"; issueNumber: number; elapsedMs: number; error: string }
  | { type: "drain" };

type AdapterType = "claude" | "codex";

export class TriageQueue extends EventEmitter {
  private queue: number[] = [];
  private active: Set<number> = new Set();
  private concurrency: number;
  private owner: string;
  private repo: string;
  private projectPath: string;
  private triagePath: string;
  private debugPath: string;
  private projectRoot: string;
  private repoSlug: string;
  private githubToken: string;
  private adapterName: AdapterType = "claude";
  private runOptions: TriageRunOptions;
  private running = false;

  constructor(config: {
    owner: string;
    repo: string;
    projectPath: string;
    triagePath: string;
    debugPath: string;
    projectRoot: string;
    repoSlug: string;
    githubToken: string;
    concurrency?: number;
    defaultAdapter?: AdapterType;
  }) {
    super();
    this.owner = config.owner;
    this.repo = config.repo;
    this.projectPath = config.projectPath;
    this.triagePath = config.triagePath;
    this.debugPath = config.debugPath;
    this.projectRoot = config.projectRoot;
    this.repoSlug = config.repoSlug;
    this.githubToken = config.githubToken;
    this.concurrency = config.concurrency || 3;
    this.adapterName = config.defaultAdapter || "claude";
    this.runOptions = {
      maxTurns: 100000,
      timeoutMs: 60 * 60 * 1000, // 1 hour
      debug: true,
    };
  }

  setAdapter(name: AdapterType) {
    this.adapterName = name;
  }

  getAdapter(): AdapterType {
    return this.adapterName;
  }

  enqueue(issueNumbers: number[]) {
    for (const num of issueNumbers) {
      if (!this.queue.includes(num) && !this.active.has(num)) {
        this.queue.push(num);
        this.emit("event", { type: "queued", issueNumber: num } as TriageQueueEvent);
      }
    }
    this.pump();
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getActiveSize(): number {
    return this.active.size;
  }

  getActiveIssues(): number[] {
    return Array.from(this.active);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;

    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const issueNumber = this.queue.shift();
      if (issueNumber !== undefined) {
        this.startOne(issueNumber);
      }
    }

    this.running = false;

    if (this.queue.length === 0 && this.active.size === 0) {
      this.emit("event", { type: "drain" } as TriageQueueEvent);
    }
  }

  private async startOne(issueNumber: number) {
    this.active.add(issueNumber);
    this.emit("event", { type: "started", issueNumber } as TriageQueueEvent);

    const startTime = Date.now();

    try {
      // Dynamically import to avoid circular dependencies
      const { IssueTriage } = await import("../issue-triager");
      const { ClaudeAdapter, CodexAdapter } = await import("../adapters");

      const adapter = this.adapterName === "claude" ? new ClaudeAdapter() : new CodexAdapter();
      const triager = new IssueTriage(
        this.githubToken,
        adapter,
        this.adapterName,
        this.triagePath,
        this.debugPath,
        this.projectRoot,
        this.repoSlug
      );

      await triager.triageIssue(
        this.owner,
        this.repo,
        issueNumber,
        this.projectPath,
        true, // Always force from TUI
        this.runOptions
      );

      const elapsedMs = Date.now() - startTime;
      this.emit("event", { type: "success", issueNumber, elapsedMs } as TriageQueueEvent);
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit("event", {
        type: "error",
        issueNumber,
        elapsedMs,
        error: errorMsg,
      } as TriageQueueEvent);
    } finally {
      this.active.delete(issueNumber);
      // Continue pumping
      this.pump();
    }
  }

  stop() {
    this.queue = [];
    // Let active tasks finish naturally
  }
}
