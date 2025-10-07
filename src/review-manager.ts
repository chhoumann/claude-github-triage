import { Glob } from "bun";

export interface IssueMetadata {
  issueNumber: number;
  triageDate: string;
  reviewStatus: "read" | "unread";
  reviewDate?: string;
  tags?: string[];
  notes?: string;
  shouldClose?: boolean;
  isDone?: boolean;
  title?: string;
  labels?: string[];
  confidence?: string;
  model?: string;
}

export interface MetadataStore {
  issues: Record<string, IssueMetadata>;
}

export class ReviewManager {
  private metadataPath = "results/.triage-metadata.json";
  private metadata: MetadataStore = { issues: {} };

  constructor() {
    // Note: loadMetadata is async but constructor can't be async
    // Must call loadMetadata() or scanForNewIssues() before using
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
    // First try config
    const { ConfigManager } = require("./config-manager");
    const configManager = new ConfigManager();
    const configRepo = configManager.getGitHubRepo();
    
    if (configRepo) {
      const [owner, repo] = configRepo.split("/");
      if (owner && repo) {
        return { owner, repo };
      }
    }
    
    // Fallback to git remote
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
    
    // Check if we have any issues without titles
    const hasIssuesWithoutTitles = Object.values(this.metadata.issues).some(
      issue => !issue.title
    );
    
    if (!hasIssuesWithoutTitles) return;

    try {
      // Fetch ALL issues in one call - much faster!
      // Use --limit 1000 to get all issues (default is 30)
      const result = Bun.spawnSync([
        "gh", "issue", "list",
        "-R", `${owner}/${repo}`,
        "--json", "number,title",
        "--limit", "1000",
        "--state", "all"  // Get both open and closed
      ]);
      
      if (result.exitCode === 0) {
        const allIssues = JSON.parse(result.stdout.toString()) as Array<{
          number: number;
          title: string;
        }>;
        
        // Create a map for quick lookup
        const titleMap = new Map(
          allIssues.map(issue => [issue.number.toString(), issue.title])
        );
        
        // Update all our issues that are missing titles
        let updated = false;
        for (const [issueId, issue] of Object.entries(this.metadata.issues)) {
          if (!issue.title && titleMap.has(issueId)) {
            issue.title = titleMap.get(issueId);
            updated = true;
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
    // Reload metadata from disk first
    await this.loadMetadata();
    
    const glob = new Glob("results/issue-*-triage.md");
    
    for await (const file of glob.scan()) {
      const match = file.match(/issue-(\d+)-triage\.md$/);
      if (match) {
        const issueNumber = match[1];
        
        // Add to metadata if not already tracked
        if (!this.metadata.issues[issueNumber]) {
          const stats = await Bun.file(file).stat();
          this.metadata.issues[issueNumber] = {
            issueNumber: parseInt(issueNumber),
            triageDate: stats.mtime.toISOString(),
            reviewStatus: "unread",
          };
        }
        
        // Parse triage file for metadata
        const content = await Bun.file(file).text();
        const issue = this.metadata.issues[issueNumber];
        
        // Parse title from file (don't fetch from GitHub here - too slow)
        const titleMatch = content.match(/^#\s+Issue\s+#\d+:\s*(.+)$/m);
        if (titleMatch) {
          issue.title = titleMatch[1].trim();
        }
        
        // Parse SHOULD_CLOSE
        const shouldCloseMatch = content.match(/SHOULD_CLOSE:\s*(Yes|No)/i);
        if (shouldCloseMatch) {
          issue.shouldClose = shouldCloseMatch[1].toLowerCase() === "yes";
        }
        
        // Parse LABELS
        const labelsMatch = content.match(/LABELS:\s*(.+)$/m);
        if (labelsMatch) {
          const labelsStr = labelsMatch[1].trim();
          issue.labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(l => l) : [];
        }
        
        // Parse CONFIDENCE
        const confidenceMatch = content.match(/CONFIDENCE:\s*(High|Medium|Low)/i);
        if (confidenceMatch) {
          issue.confidence = confidenceMatch[1];
        }
        
        // Parse model from debug.json
        const debugFile = Bun.file(`results/issue-${issueNumber}-triage-debug.json`);
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
      issue.reviewStatus = "read";
      issue.reviewDate = now;
    }
    
    await this.saveMetadata();
  }

  async markAsDone(issueNumber: number, done: boolean = true): Promise<void> {
    await this.scanForNewIssues();
    
    const issue = this.metadata.issues[issueNumber.toString()];
    if (issue) {
      issue.isDone = done;
      await this.saveMetadata();
    }
  }

  async getInbox(
    filter?: "all" | "read" | "unread",
    sort?: "number" | "date",
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
    if (sort === "date") {
      issues.sort(
        (a, b) =>
          new Date(b.triageDate).getTime() - new Date(a.triageDate).getTime(),
      );
    } else {
      issues.sort((a, b) => b.issueNumber - a.issueNumber);
    }
    
    return issues;
  }

  async getNextUnread(): Promise<IssueMetadata | null> {
    const unread = await this.getInbox("unread", "number");
    return unread.length > 0 ? unread[0] : null;
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

  async updateTriageMetadata(issueNumber: number): Promise<void> {
    // Called when an issue is triaged
    if (!this.metadata.issues[issueNumber.toString()]) {
      this.metadata.issues[issueNumber.toString()] = {
        issueNumber,
        triageDate: new Date().toISOString(),
        reviewStatus: "unread",
      };
      await this.saveMetadata();
    }
  }
}