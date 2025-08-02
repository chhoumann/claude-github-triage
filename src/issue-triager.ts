import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import type { RestEndpointMethodTypes } from "@octokit/rest";
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
      console.log(`  ⏭️  Skipping issue #${issueNumber} - already triaged`);
      return;
    }
    
    console.log(`  Fetching issue details...`);
    const issue = await this.githubClient.getIssue(owner, repo, issueNumber);

    const prompt = this.buildTriagePrompt(issue, owner, repo);

    console.log(`  Analyzing with Claude Code SDK...`);
    const messages: SDKMessage[] = [];
    const abortController = new AbortController();

    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log(`  Analysis timeout - aborting...`);
      abortController.abort();
    }, 600000); // 10 minute timeout per issue

    try {
      for await (const message of query({
        prompt,
        abortController,
        options: {
          maxTurns: 100000,
          cwd: projectPath,
        },
      })) {
        messages.push(message);
        if ("role" in message && message.role === "assistant") {
          console.log(
            `  Claude is analyzing... (turn ${messages.filter((m) => "role" in m && m.role === "assistant").length})`,
          );
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(`  Parsing response... (${messages.length} messages received)`);
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
      console.error(`No response from Claude for issue #${issueNumber}`);
    }

    console.log(`  Triage complete for issue #${issueNumber}`);
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
    const concurrencyLimit = options?.concurrency || 3; // Default to 3 concurrent triages
    const results: Promise<TriageResult>[] = [];
    const activePromises = new Map<number, Promise<TriageResult>>();
    let processedCount = 0;
    let skippedCount = 0;
    let totalCount = 0;

    console.log(`Starting issue triage with concurrency limit: ${concurrencyLimit}`);
    if (options?.force) {
      console.log(`Force mode enabled - will re-triage existing issues`);
    }

    // Helper function to wait for a slot to become available
    const waitForSlot = async () => {
      while (activePromises.size >= concurrencyLimit) {
        await Promise.race(activePromises.values());
      }
    };

    // Process issues from the generator
    for await (const issue of this.githubClient.listIssuesPaginated(owner, repo, {
      state: options?.state,
      labels: options?.labels,
      sort: options?.sort,
      direction: options?.direction,
    })) {
      // Check if we've reached the limit
      if (options?.limit && processedCount >= options.limit) {
        break;
      }

      totalCount++;
      
      // Skip issues without numbers
      if (!issue.number) continue;

      // Check if already triaged (unless force mode)
      if (!options?.force) {
        const resultPath = `results/issue-${issue.number}-triage.md`;
        const resultFile = Bun.file(resultPath);
        if (await resultFile.exists()) {
          skippedCount++;
          console.log(
            `[${processedCount + skippedCount}/${options?.limit || "all"}] ⏭️  Skipping issue #${issue.number}: ${issue.title} (already triaged)`,
          );
          continue;
        }
      }

      // Wait for a slot to become available
      await waitForSlot();

      console.log(
        `[${processedCount + 1}/${options?.limit || "all"}] Starting triage for issue #${issue.number}: ${issue.title}`,
      );

      // Create the triage promise
      const triagePromise = this.triageIssue(
        owner,
        repo,
        issue.number,
        projectPath,
        options?.force || false,
      ).then(() => {
        activePromises.delete(issue.number);
        processedCount++;
        console.log(`[${processedCount}/${options?.limit || totalCount}] Completed triage for issue #${issue.number}`);
        return {
          issue: {
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
          },
          recommendation: undefined, // triageIssue saves results to file, doesn't return them
        };
      }).catch((error) => {
        activePromises.delete(issue.number);
        processedCount++;
        console.error(`[${processedCount}/${options?.limit || totalCount}] Failed to triage issue #${issue.number}:`, error);
        return {
          issue: {
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
          },
          recommendation: {
            shouldClose: false,
            labels: [],
            confidence: "low" as const,
            reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      });

      // Add to active promises
      activePromises.set(issue.number, triagePromise);
      results.push(triagePromise);

      // If we've reached the limit, break
      if (options?.limit && processedCount + activePromises.size >= options.limit) {
        break;
      }
    }

    // Wait for all remaining triages to complete
    console.log(`Waiting for ${activePromises.size} remaining triages to complete...`);
    const finalResults = await Promise.all(results);
    
    console.log(`\nTriage complete:`);
    console.log(`  ✅ Processed: ${processedCount} issues`);
    if (skippedCount > 0) {
      console.log(`  ⏭️  Skipped: ${skippedCount} issues (already triaged)`);
    }
    console.log(`  📊 Total found: ${totalCount} issues`);
    
    return finalResults;
  }
}
