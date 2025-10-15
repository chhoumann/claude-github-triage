import type { RestEndpointMethodTypes } from "@octokit/rest";
import { Listr } from "listr2";
import type { AgentAdapter, AgentMessage } from "./adapters";
import { GitHubClient } from "./github";
import { ReviewManager } from "./review-manager";

type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
type IssueComment =
  RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"][number];

type TriageResult = {
  issue: {
    number: number;
    title: string;
    url: string;
  };
  recommendation?: {
    shouldClose: boolean;
    labels: string[];
    confidence: "low" | "medium" | "high";
    reasoning: string;
  };
};

export type TriageRunOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  debug?: boolean;
};

export type TriageProgress =
  | { type: "started"; issueNumber: number }
  | { type: "skipped"; issueNumber: number }
  | { type: "success"; issueNumber: number; elapsedMs: number }
  | { type: "error"; issueNumber: number; elapsedMs: number; error: string };

export class IssueTriage {
  private githubClient: GitHubClient;
  private reviewManager: ReviewManager;
  private agentAdapter: AgentAdapter;
  private adapterName: string;
  private triagePath: string;
  private debugPath: string;

  constructor(
    githubToken: string,
    agentAdapter: AgentAdapter,
    adapterName: string,
    triagePath: string = "results",
    debugPath: string = "results",
    projectRoot: string = "results",
    repoSlug?: string
  ) {
    this.githubClient = new GitHubClient(githubToken);
    this.reviewManager = new ReviewManager(projectRoot, repoSlug);
    this.agentAdapter = agentAdapter;
    this.adapterName = adapterName;
    this.triagePath = triagePath;
    this.debugPath = debugPath;
  }

  async triageIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    projectPath: string,
    force = false,
    runOptions?: TriageRunOptions,
  ): Promise<void> {
    const resultPath = `${this.triagePath}/issue-${issueNumber}-triage.md`;
    const resultFile = Bun.file(resultPath);
    
    if (!force && await resultFile.exists()) {
      return;
    }
    
    const [issue, comments] = await Promise.all([
      this.githubClient.getIssue(owner, repo, issueNumber),
      this.githubClient.listIssueComments(owner, repo, issueNumber),
    ]);

    let triageActorLogin = "unknown-user";
    try {
      const authenticatedUser = await this.githubClient.getAuthenticatedUser();
      if (authenticatedUser?.login) {
        triageActorLogin = authenticatedUser.login;
      }
    } catch {
      // The token might not have permission to read the authenticated user; fall back gracefully.
    }

    const prompt = this.buildTriagePrompt(
      issue,
      owner,
      repo,
      comments,
      triageActorLogin,
    );
    const messages: AgentMessage[] = [];

    const maxTurns = runOptions?.maxTurns ?? 100000;
    const timeout = runOptions?.timeoutMs ?? 3600000;

    for await (const message of this.agentAdapter.query(prompt, {
      maxTurns,
      cwd: projectPath,
      timeout,
    })) {
      messages.push(message);
    }

    const lastMessage = messages[messages.length - 1];
    const DEBUG = runOptions?.debug ?? true;

    if (DEBUG) {
      Bun.write(
        `${this.debugPath}/issue-${issueNumber}-triage-debug.json`,
        JSON.stringify(messages, null, 2),
      );
    }

    if (
      lastMessage &&
      lastMessage.type === "result" &&
      lastMessage.subtype === "success"
    ) {
      const triageOutput = lastMessage.result;
      if (typeof triageOutput !== "string") {
        throw new Error(
          `Claude returned a success result for issue #${issueNumber} without a payload`,
        );
      }

      await Bun.write(resultPath, triageOutput);
      // Update review metadata
      await this.reviewManager.updateTriageMetadata(issueNumber, this.adapterName);
    } else {
      throw new Error(`No response from Claude for issue #${issueNumber}`);
    }
  }

  private buildTriagePrompt(
    issue: Issue,
    owner: string,
    repo: string,
    comments: IssueComment[],
    triageActorLogin: string,
  ): string {
    const issueBody = issue.body || "No description provided";
    const truncatedBody =
      issueBody.length > 1000
        ? `${issueBody.substring(0, 1000)}...`
        : issueBody;
    const MAX_COMMENTS = 20;
    const totalComments = comments.length;
    const MAX_COMMENT_LENGTH = 800;
    const commentsToInclude = comments.slice(0, MAX_COMMENTS);
    const commentsShownCount = commentsToInclude.length;
    const formattedComments =
      commentsToInclude.length > 0
        ? commentsToInclude
            .map((comment, index) => {
              const author = comment.user?.login || "unknown-user";
              const createdAt = comment.created_at
                ? new Date(comment.created_at).toISOString()
                : "unknown-date";
              const rawBody = comment.body || "No comment body provided.";
              const normalizedBody = rawBody.replace(/\r\n/g, "\n").trim();
              const truncatedComment =
                normalizedBody.length > MAX_COMMENT_LENGTH
                  ? `${normalizedBody.slice(0, MAX_COMMENT_LENGTH)}...`
                  : normalizedBody;
              const safeBody = truncatedComment.length > 0
                ? truncatedComment
                : "(comment body was empty)";
              return `Comment ${index + 1} by ${author} on ${createdAt}:\n${safeBody}`;
            })
            .join("\n\n")
        : "No comments available on this issue.";
    const remainingComments = comments.length - commentsToInclude.length;
    const commentsFooter =
      remainingComments > 0
        ? `\n\n[${remainingComments} additional comment(s) not shown due to length limits]`
        : "";

    return `Triage GitHub issue #${issue.number} for ${owner}/${repo}.

Title: ${issue.title}
Body: ${truncatedBody}
Author: ${issue.user?.login}
Authenticated triager (GitHub login): ${triageActorLogin}

Issue comments (showing ${commentsShownCount} of ${totalComments}):
${formattedComments}${commentsFooter}

Search the codebase for relevant context, then provide a triage recommendation.

Your FINAL message must be a complete analysis in this exact format:

=== TRIAGE ANALYSIS START ===
SHOULD_CLOSE: Yes/No
LABELS: label1, label2, label3
CONFIDENCE: High/Medium/Low

ANALYSIS:
[Your detailed analysis and reasoning here]

SUGGESTED_RESPONSE:
[Optional: A helpful response to post on the issue, writing as the triager]
=== TRIAGE ANALYSIS END ===
`;
  }

  async triageMultipleIssues(
    owner: string,
    repo: string,
    projectPath: string,
    options?: {
      state?: "open" | "closed" | "all";
      labels?: string[];
      limit?: number;
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      concurrency?: number;
      force?: boolean;
    },
  ) {
    const concurrencyLimit = options?.concurrency || 3;
    let skippedCount = 0;
    let processedCount = 0;
    let failedCount = 0;

    // Collect all issues first
    const issuesToTriage: Array<{ number: number; title: string; html_url: string }> = [];
    
    for await (const issue of this.githubClient.listIssuesPaginated(owner, repo, {
      state: options?.state,
      labels: options?.labels,
      sort: options?.sort,
      direction: options?.direction,
    })) {
      if (!issue.number) continue;
      
      // Check limit
      if (options?.limit && issuesToTriage.length + skippedCount >= options.limit) {
        break;
      }

      if (!options?.force) {
        const resultPath = `${this.triagePath}/issue-${issue.number}-triage.md`;
        const resultFile = Bun.file(resultPath);
        if (await resultFile.exists()) {
          skippedCount++;
          continue;
        }
      }

      issuesToTriage.push({
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
      });

      if (options?.limit && issuesToTriage.length >= options.limit) {
        break;
      }
    }

    if (issuesToTriage.length === 0) {
      console.log("\n✨ No issues to triage!");
      if (skippedCount > 0) {
        console.log(`⏭️  Skipped ${skippedCount} already-triaged issues`);
      }
      return [];
    }

    // Create listr2 tasks
    const tasks = new Listr(
      issuesToTriage.map((issue) => ({
        title: `Issue #${issue.number}: ${issue.title}`,
        task: async (ctx, task) => {
          const startTime = Date.now();
          try {
            await this.triageIssue(
              owner,
              repo,
              issue.number,
              projectPath,
              options?.force || false,
            );
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            task.title = `Issue #${issue.number}: ${issue.title} [${elapsed}s]`;
            processedCount++;
          } catch (error) {
            failedCount++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            task.title = `Issue #${issue.number}: ${issue.title} [${elapsed}s]`;
            throw new Error(error instanceof Error ? error.message : String(error));
          }
        },
      })),
      {
        concurrent: concurrencyLimit,
        exitOnError: false,
      },
    );

    // Print initial info
    console.log(`\n🔍 Triaging ${issuesToTriage.length} issues for ${owner}/${repo}`);
    console.log(`📁 Codebase: ${projectPath}`);
    console.log(`⚙️  Concurrency: ${concurrencyLimit}`);
    if (options?.force) {
      console.log(`🔄 Force mode: enabled`);
    }
    if (skippedCount > 0) {
      console.log(`⏭️  Skipped: ${skippedCount} already-triaged issues`);
    }
    console.log();

    // Run tasks
    try {
      await tasks.run();
    } catch (error) {
      // Errors are handled per-task, continue to summary
    }

    // Print summary
    console.log(`\n📊 Triage Summary:`);
    console.log(`  ✅ Completed: ${processedCount} issues`);
    if (failedCount > 0) {
      console.log(`  ❌ Failed: ${failedCount} issues`);
    }
    if (skippedCount > 0) {
      console.log(`  ⏭️  Skipped: ${skippedCount} issues`);
    }
    console.log(`  📁 Results: results/`);

    return issuesToTriage.map((issue) => ({
      issue: {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
      },
      recommendation: undefined,
    }));
  }

  async triageIssuesList(
    owner: string,
    repo: string,
    projectPath: string,
    issueNumbers: number[],
    options?: {
      concurrency?: number;
      force?: boolean;
      run?: TriageRunOptions;
      onProgress?: (e: TriageProgress) => void;
    },
  ): Promise<void> {
    const concurrencyLimit = options?.concurrency || 3;
    let skippedCount = 0;
    let processedCount = 0;
    let failedCount = 0;

    // Check which issues need triaging
    const issuesToTriage: number[] = [];
    
    for (const issueNumber of issueNumbers) {
      if (!options?.force) {
        const resultPath = `${this.triagePath}/issue-${issueNumber}-triage.md`;
        const resultFile = Bun.file(resultPath);
        if (await resultFile.exists()) {
          skippedCount++;
          options?.onProgress?.({ type: "skipped", issueNumber });
          continue;
        }
      }
      issuesToTriage.push(issueNumber);
    }

    if (issuesToTriage.length === 0) {
      return;
    }

    // Create listr2 tasks
    const tasks = new Listr(
      issuesToTriage.map((issueNumber) => ({
        title: `Issue #${issueNumber}`,
        task: async (ctx, task) => {
          const startTime = Date.now();
          options?.onProgress?.({ type: "started", issueNumber });
          
          try {
            await this.triageIssue(
              owner,
              repo,
              issueNumber,
              projectPath,
              options?.force || false,
              options?.run,
            );
            const elapsed = Date.now() - startTime;
            task.title = `Issue #${issueNumber} [${(elapsed / 1000).toFixed(1)}s]`;
            processedCount++;
            options?.onProgress?.({ type: "success", issueNumber, elapsedMs: elapsed });
          } catch (error) {
            failedCount++;
            const elapsed = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            task.title = `Issue #${issueNumber} [${(elapsed / 1000).toFixed(1)}s] ❌`;
            options?.onProgress?.({ type: "error", issueNumber, elapsedMs: elapsed, error: errorMsg });
            throw new Error(errorMsg);
          }
        },
      })),
      {
        concurrent: concurrencyLimit,
        exitOnError: false,
      },
    );

    // Run tasks
    try {
      await tasks.run();
    } catch (error) {
      // Errors are handled per-task via onProgress
    }
  }
}
