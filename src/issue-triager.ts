import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { Listr } from "listr2";
import { GitHubClient } from "./github";
import { ReviewManager } from "./review-manager";

type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

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

export class IssueTriage {
  private githubClient: GitHubClient;
  private reviewManager: ReviewManager;

  constructor(githubToken: string) {
    this.githubClient = new GitHubClient(githubToken);
    this.reviewManager = new ReviewManager();
  }

  async triageIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    projectPath: string,
    force = false,
  ): Promise<void> {
    // Check if we've already triaged this issue
    const resultPath = `results/issue-${issueNumber}-triage.md`;
    const resultFile = Bun.file(resultPath);
    
    if (!force && await resultFile.exists()) {
      return;
    }
    
    const issue = await this.githubClient.getIssue(owner, repo, issueNumber);
    const prompt = this.buildTriagePrompt(issue, owner, repo);
    const messages: SDKMessage[] = [];

    for await (const message of query({
      prompt,
      options: {
        maxTurns: 100000,
        cwd: projectPath,
        timeout: 3600000, // 1 hour in milliseconds
      },
    })) {
      messages.push(message);
    }

    const lastMessage = messages[messages.length - 1];
    const DEBUG = true;

    if (DEBUG) {
      Bun.write(
        `results/issue-${issueNumber}-triage-debug.json`,
        JSON.stringify(messages, null, 2),
      );
    }

    if (
      lastMessage &&
      lastMessage.type === "result" &&
      lastMessage.subtype === "success"
    ) {
      await Bun.write(`results/issue-${issueNumber}-triage.md`, lastMessage.result);
      // Update review metadata
      await this.reviewManager.updateTriageMetadata(issueNumber);
    } else {
      throw new Error(`No response from Claude for issue #${issueNumber}`);
    }
  }

  private buildTriagePrompt(issue: Issue, owner: string, repo: string): string {
    const issueBody = issue.body || "No description provided";
    const truncatedBody =
      issueBody.length > 1000
        ? `${issueBody.substring(0, 1000)}...`
        : issueBody;

    return `Triage GitHub issue #${issue.number} for ${owner}/${repo}.

Title: ${issue.title}
Body: ${truncatedBody}
Author: ${issue.user?.login}

Search the codebase for relevant context, then provide a triage recommendation.

Your FINAL message must be a complete analysis in this exact format:

=== TRIAGE ANALYSIS START ===
SHOULD_CLOSE: Yes/No
LABELS: label1, label2, label3
CONFIDENCE: High/Medium/Low

ANALYSIS:
[Your detailed analysis and reasoning here]

SUGGESTED_RESPONSE:
[Optional: A helpful response to post on the issue]
=== TRIAGE ANALYSIS END ===`;
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

      // Check if already triaged (unless force mode)
      if (!options?.force) {
        const resultPath = `results/issue-${issue.number}-triage.md`;
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
}
