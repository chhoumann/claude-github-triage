import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { GitHubClient } from "./github";

type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

export class IssueTriage {
  private githubClient: GitHubClient;

  constructor(githubToken: string) {
    this.githubClient = new GitHubClient(githubToken);
  }

  async triageIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    projectPath: string,
  ): Promise<void> {
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
      Bun.write(`results/issue-${issueNumber}-triage.md`, lastMessage.result);
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
    },
  ) {
    this.githubClient.listIssues;
    const issues = await this.githubClient.listIssues(owner, repo, {
      state: options?.state,
      labels: options?.labels,
      per_page: options?.limit || 10,
      sort: options?.sort,
      direction: options?.direction,
    });

    console.log(`Found ${issues.length} issues to triage`);

    // Process all issues concurrently
    const promises = issues
      .filter((issue) => issue.number)
      .map(async (issue) => {
        console.log(
          `Starting triage for issue #${issue.number}: ${issue.title}`,
        );

        try {
          const recommendation = await this.triageIssue(
            owner,
            repo,
            issue.number,
            projectPath,
          );

          return {
            issue: {
              number: issue.number,
              title: issue.title,
              url: issue.html_url,
            },
            recommendation,
          };
        } catch (error) {
          console.error(`Failed to triage issue #${issue.number}:`, error);
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
        }
      });

    // Wait for all triages to complete
    const results = await Promise.all(promises);
    return results;
  }
}
