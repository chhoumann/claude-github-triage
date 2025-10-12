import { GitHubClient } from "./github";
import { ReviewManager } from "./review-manager";
import type { ProjectContext } from "./project-context";

export interface SyncResult {
  totalClosed: number;
  updated: number;
  alreadyMarked: number;
}

export async function syncClosedIssues(ctx: ProjectContext): Promise<SyncResult> {
  const githubClient = new GitHubClient(ctx.token);
  const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
  await reviewManager.loadMetadata();

  let page = 1;
  let totalClosed = 0;
  let updated = 0;
  const alreadyMarked: number[] = [];

  while (true) {
    const issues = await githubClient.listIssues(ctx.owner, ctx.repo, {
      state: "closed",
      per_page: 100,
      page,
    });

    if (issues.length === 0) break;

    for (const issue of issues) {
      const triageFile = Bun.file(`${ctx.paths.triage}/issue-${issue.number}-triage.md`);
      if (await triageFile.exists()) {
        totalClosed++;
        const metadata = await reviewManager.getInbox("all");
        const issueMetadata = metadata.find((m) => m.issueNumber === issue.number);

        if (issueMetadata && issueMetadata.reviewStatus === "unread") {
          await reviewManager.markAsRead(issue.number);
          await reviewManager.markClosedOnGitHub(issue.number, true);
          updated++;
        } else if (issueMetadata && issueMetadata.reviewStatus === "read") {
          if (!issueMetadata.closedOnGitHub) {
            await reviewManager.markClosedOnGitHub(issue.number, true);
            updated++;
          } else {
            alreadyMarked.push(issue.number);
          }
        }
      }
    }

    if (issues.length < 100) break;
    page++;
  }

  return {
    totalClosed,
    updated,
    alreadyMarked: alreadyMarked.length,
  };
}
