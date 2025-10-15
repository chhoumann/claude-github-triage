import { Glob } from "bun";

export interface IssueMetadata {
  issueNumber: number;
  triageDate: string;
  reviewStatus: "read" | "unread";
  reviewDate?: string;
  tags?: string[];
  notes?: string;
  shouldClose?: boolean;
  closedOnGitHub?: boolean;
  title?: string;
  labels?: string[];
  confidence?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetadataStore {
  issues: Record<string, IssueMetadata>;
}

export class ReviewManager {
  private metadataPath: string;
  private metadata: MetadataStore = { issues: {} };

  constructor(
    private projectRoot: string = "results",
    private repoSlug?: string
  ) {
    this.metadataPath = `${projectRoot}/.triage-metadata.json`;
  }

  public async loadMetadata(): Promise<void> {
    try {
      const file = Bun.file(this.metadataPath);
      if (await file.exists()) {
        const content = await file.text();
        this.metadata = JSON.parse(content);
      }
    } catch (error) {
      console.error("Failed to load metadata:", error);
      this.metadata = { issues: {} };
    }
  }

  private async saveMetadata(): Promise<void> {
    await Bun.write(this.metadataPath, JSON.stringify(this.metadata, null, 2));
  }

  private getGitHubRepo(): { owner: string; repo: string } | null {
    if (this.repoSlug) {
      const [owner, repo] = this.repoSlug.split("/");
      if (owner && repo) {
        return { owner, repo };
      }
    }

    const { ConfigManager } = require("./config-manager");
    const configManager = new ConfigManager();
    const configRepo = configManager.getGitHubRepo();
    
    if (configRepo) {
      const [owner, repo] = configRepo.split("/");
      if (owner && repo) {
        return { owner, repo };
      }
    }
    
    try {
      const gitRemote = Bun.spawnSync(["git", "config", "--get", "remote.origin.url"], {
        cwd: process.cwd(),
      });
      
      if (gitRemote.exitCode === 0) {
        const remoteUrl = gitRemote.stdout.toString().trim();
        const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
        
        if (match) {
          return { owner: match[1]!, repo: match[2]! };
        }
      }
    } catch (err) {
      // Ignore
    }
    return null;
  }

  public async fetchMissingTitlesInBackground(onUpdate?: () => void): Promise<void> {
    const repoInfo = this.getGitHubRepo();
    if (!repoInfo) return;

    const { owner, repo } = repoInfo;

    // Check if we have any issues without titles or dates
    const hasIssuesWithoutData = Object.values(this.metadata.issues).some(
      issue => !issue.title || !issue.createdAt || !issue.updatedAt
    );

    if (!hasIssuesWithoutData) return;

    try {
      // Fetch ALL issues in one call - much faster!
      // Use --limit 1000 to get all issues (default is 30)
      const result = Bun.spawnSync([
        "gh", "issue", "list",
        "-R", `${owner}/${repo}`,
        "--json", "number,title,createdAt,updatedAt",
        "--limit", "1000",
        "--state", "all"  // Get both open and closed
      ]);

      if (result.exitCode === 0) {
        const allIssues = JSON.parse(result.stdout.toString()) as Array<{
          number: number;
          title: string;
          createdAt: string;
          updatedAt: string;
        }>;

        // Create a map for quick lookup
        const issueMap = new Map(
          allIssues.map(issue => [issue.number.toString(), issue])
        );

        // Update all our issues that are missing data
        let updated = false;
        for (const [issueId, issue] of Object.entries(this.metadata.issues)) {
          const ghIssue = issueMap.get(issueId);
          if (ghIssue && issue) {
            if (!issue.title && ghIssue.title) {
              issue.title = ghIssue.title;
              updated = true;
            }
            if (!issue.createdAt && ghIssue.createdAt) {
              issue.createdAt = ghIssue.createdAt;
              updated = true;
            }
            if (!issue.updatedAt && ghIssue.updatedAt) {
              issue.updatedAt = ghIssue.updatedAt;
              updated = true;
            }
          }
        }

        // Save and trigger update if anything changed
        if (updated) {
          await this.saveMetadata();
          if (onUpdate) {
            onUpdate();
          }
        }
      }
    } catch (err) {
      // Silently fail - not critical
    }
  }

  public async scanForNewIssues(): Promise<void> {
    await this.loadMetadata();
    
    const triageDir = `${this.projectRoot}/triage`;
    const debugDir = `${this.projectRoot}/debug`;
    
    const fs = require('fs');
    const triagePattern = fs.existsSync(triageDir)
      ? `${triageDir}/issue-*-triage.md`
      : `${this.projectRoot}/issue-*-triage.md`;
    
    const glob = new Glob(triagePattern);
    
    for await (const file of glob.scan()) {
      const match = file.match(/issue-(\d+)-triage\.md$/);
      if (match && match[1]) {
        const issueNumber = match[1];
        const stats = await Bun.file(file).stat();
        const fileMtime = stats.mtime.toISOString();

        if (!this.metadata.issues[issueNumber]) {
          this.metadata.issues[issueNumber] = {
            issueNumber: parseInt(issueNumber),
            triageDate: fileMtime,
            reviewStatus: "unread",
          };
        }

        const content = await Bun.file(file).text();
        const issue = this.metadata.issues[issueNumber];

        if (issue) {
          // Update triageDate if file was modified (re-triaged)
          if (new Date(fileMtime).getTime() > new Date(issue.triageDate).getTime()) {
            issue.triageDate = fileMtime;
          }
          const titleMatch = content.match(/^#\s+Issue\s+#\d+:\s*(.+)$/m);
          if (titleMatch && titleMatch[1]) {
            issue.title = titleMatch[1].trim();
          }

          const shouldCloseMatch = content.match(/SHOULD_CLOSE:\s*(Yes|No)/i);
          if (shouldCloseMatch && shouldCloseMatch[1]) {
            issue.shouldClose = shouldCloseMatch[1].toLowerCase() === "yes";
          }

          const labelsMatch = content.match(/LABELS:\s*(.+)$/m);
          if (labelsMatch && labelsMatch[1]) {
            const labelsStr = labelsMatch[1].trim();
            issue.labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(l => l) : [];
          }

          const confidenceMatch = content.match(/CONFIDENCE:\s*(High|Medium|Low)/i);
          if (confidenceMatch && confidenceMatch[1]) {
            issue.confidence = confidenceMatch[1];
          }

          const debugPath = fs.existsSync(debugDir)
            ? `${debugDir}/issue-${issueNumber}-triage-debug.json`
            : `${this.projectRoot}/issue-${issueNumber}-triage-debug.json`;

          const debugFile = Bun.file(debugPath);
          if (await debugFile.exists()) {
            try {
              const debugContent = await debugFile.text();
              const debugData = JSON.parse(debugContent);
              if (Array.isArray(debugData) && debugData.length > 0 && debugData[0].model) {
                issue.model = debugData[0].model;
              }
            } catch (err) {
              // Ignore parse errors
            }
          }
        }
      }
    }
    
    await this.saveMetadata();
  }

  async markAsRead(issueNumber: number): Promise<void> {
    await this.scanForNewIssues(); // Ensure we have latest data
    
    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.reviewStatus = "read";
      issue.reviewDate = new Date().toISOString();
      await this.saveMetadata();
    }
  }

  async markAsUnread(issueNumber: number): Promise<void> {
    await this.scanForNewIssues();
    
    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.reviewStatus = "unread";
      delete issue.reviewDate;
      await this.saveMetadata();
    }
  }

  async markAllAsRead(): Promise<void> {
    await this.scanForNewIssues();

    const now = new Date().toISOString();
    for (const issueId in this.metadata.issues) {
      const issue = this.metadata.issues[issueId];
      if (issue) {
        issue.reviewStatus = "read";
        issue.reviewDate = now;
      }
    }

    await this.saveMetadata();
  }

  async markClosedOnGitHub(issueNumber: number, closed: boolean = true): Promise<void> {
    await this.scanForNewIssues();

    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.closedOnGitHub = closed;
      await this.saveMetadata();
    }
  }

  async migrateStatusFields(githubToken: string): Promise<{
    totalIssues: number;
    closedOnGitHub: number;
    openOnGitHub: number;
    removedIsDone: number;
    notFoundOnGitHub: number;
  }> {
    await this.loadMetadata();

    const repoInfo = this.getGitHubRepo();
    if (!repoInfo) {
      throw new Error("Could not determine GitHub repository. Please configure it first.");
    }

    const { owner, repo } = repoInfo;
    const { GitHubClient } = await import("./github");
    const githubClient = new GitHubClient(githubToken);

    // Fetch all issues from GitHub (both open and closed)
    const githubIssuesMap = new Map<number, "open" | "closed">();

    // Fetch open issues
    let page = 1;
    while (true) {
      const openIssues = await githubClient.listIssues(owner, repo, {
        state: "open",
        per_page: 100,
        page,
      });
      if (openIssues.length === 0) break;
      for (const issue of openIssues) {
        githubIssuesMap.set(issue.number, "open");
      }
      if (openIssues.length < 100) break;
      page++;
    }

    // Fetch closed issues
    page = 1;
    while (true) {
      const closedIssues = await githubClient.listIssues(owner, repo, {
        state: "closed",
        per_page: 100,
        page,
      });
      if (closedIssues.length === 0) break;
      for (const issue of closedIssues) {
        githubIssuesMap.set(issue.number, "closed");
      }
      if (closedIssues.length < 100) break;
      page++;
    }

    let closedCount = 0;
    let openCount = 0;
    let removedIsDoneCount = 0;
    let notFoundCount = 0;

    // Update all issues in our metadata
    for (const [issueId, issue] of Object.entries(this.metadata.issues)) {
      const issueNumber = parseInt(issueId);
      const githubState = githubIssuesMap.get(issueNumber);

      if (!githubState) {
        notFoundCount++;
        continue;
      }

      // Remove isDone field if it exists
      const hadIsDone = "isDone" in issue;
      if (hadIsDone) {
        delete (issue as any).isDone;
        removedIsDoneCount++;
      }

      // Set closedOnGitHub based on actual GitHub state
      if (githubState === "closed") {
        issue.closedOnGitHub = true;
        closedCount++;
      } else {
        issue.closedOnGitHub = false;
        openCount++;
      }
    }

    await this.saveMetadata();

    return {
      totalIssues: Object.keys(this.metadata.issues).length,
      closedOnGitHub: closedCount,
      openOnGitHub: openCount,
      removedIsDone: removedIsDoneCount,
      notFoundOnGitHub: notFoundCount,
    };
  }

  async getInbox(
    filter?: "all" | "read" | "unread",
    sort?: "number" | "date" | "triage-date" | "created" | "activity",
    closeFilter?: "yes" | "no" | "unknown" | "not-no",
  ): Promise<IssueMetadata[]> {
    await this.scanForNewIssues();

    let issues = Object.values(this.metadata.issues);

    // Apply read/unread filter
    if (filter === "read") {
      issues = issues.filter((i) => i.reviewStatus === "read");
    } else if (filter === "unread") {
      issues = issues.filter((i) => i.reviewStatus === "unread");
    }

    // Apply SHOULD_CLOSE filter
    if (closeFilter) {
      if (closeFilter === "yes") {
        issues = issues.filter((i) => i.shouldClose === true);
      } else if (closeFilter === "no") {
        issues = issues.filter((i) => i.shouldClose === false);
      } else if (closeFilter === "unknown") {
        issues = issues.filter((i) => typeof i.shouldClose === "undefined");
      } else if (closeFilter === "not-no") {
        issues = issues.filter((i) => i.shouldClose !== false);
      }
    }

    // Apply sort
    if (sort === "date" || sort === "triage-date") {
      // Sort by when we triaged the issue
      issues.sort(
        (a, b) =>
          new Date(b.triageDate).getTime() - new Date(a.triageDate).getTime(),
      );
    } else if (sort === "created") {
      // Sort by when the issue was created on GitHub
      issues.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    } else if (sort === "activity") {
      // Sort by when the issue was last updated on GitHub
      issues.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
    } else {
      // Default: sort by issue number
      issues.sort((a, b) => b.issueNumber - a.issueNumber);
    }

    return issues;
  }

  async getNextUnread(): Promise<IssueMetadata | null> {
    const unread = await this.getInbox("unread", "number");
    return unread.length > 0 && unread[0] ? unread[0] : null;
  }

  async getStats(): Promise<{ total: number; read: number; unread: number }> {
    await this.scanForNewIssues();
    
    const issues = Object.values(this.metadata.issues);
    return {
      total: issues.length,
      read: issues.filter(i => i.reviewStatus === "read").length,
      unread: issues.filter(i => i.reviewStatus === "unread").length,
    };
  }

  async addNote(issueNumber: number, note: string): Promise<void> {
    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.notes = note;
      await this.saveMetadata();
    }
  }

  async addTags(issueNumber: number, tags: string[]): Promise<void> {
    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.tags = [...new Set([...(issue.tags || []), ...tags])];
      await this.saveMetadata();
    }
  }

  async updateTriageMetadata(issueNumber: number, model?: string): Promise<void> {
    // Called when an issue is triaged
    const issueKey = issueNumber.toString();
    if (!this.metadata.issues[issueKey]) {
      this.metadata.issues[issueKey] = {
        issueNumber,
        triageDate: new Date().toISOString(),
        reviewStatus: "unread",
      };
    }

    // Update model if provided
    if (model) {
      this.metadata.issues[issueKey].model = model;
    }

    await this.saveMetadata();
  }

  async syncAllIssuesFromGitHub(githubToken: string, owner: string, repo: string): Promise<{
    total: number;
    triaged: number;
    untriaged: number;
  }> {
    await this.loadMetadata();

    const { GitHubClient } = await import("./github");
    const githubClient = new GitHubClient(githubToken);

    let total = 0;
    let triaged = 0;
    let untriaged = 0;

    // Fetch all issues from GitHub
    for await (const issue of githubClient.listIssuesPaginated(owner, repo, {
      state: "all",
    })) {
      // Skip pull requests (GitHub API returns both issues and PRs)
      if ('pull_request' in issue) {
        continue;
      }

      total++;
      const issueKey = issue.number.toString();
      const existingMetadata = this.metadata.issues[issueKey];

      if (existingMetadata) {
        // Issue has been triaged - update GitHub data
        triaged++;
        existingMetadata.title = issue.title;
        existingMetadata.createdAt = issue.created_at;
        existingMetadata.updatedAt = issue.updated_at;
        existingMetadata.closedOnGitHub = issue.state === "closed";
      } else {
        // Issue hasn't been triaged - create minimal entry
        untriaged++;
        this.metadata.issues[issueKey] = {
          issueNumber: issue.number,
          triageDate: "", // Empty string indicates untriaged
          reviewStatus: "unread",
          title: issue.title,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedOnGitHub: issue.state === "closed",
        };
      }
    }

    await this.saveMetadata();

    return { total, triaged, untriaged };
  }
}