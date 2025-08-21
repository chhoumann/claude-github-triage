import { Glob } from "bun";

export interface IssueMetadata {
  issueNumber: number;
  triageDate: string;
  reviewStatus: "read" | "unread";
  reviewDate?: string;
  tags?: string[];
  notes?: string;
  shouldClose?: boolean;
}

export interface MetadataStore {
  issues: Record<string, IssueMetadata>;
}

export class ReviewManager {
  private metadataPath = "results/.triage-metadata.json";
  private metadata: MetadataStore = { issues: {} };

  constructor() {
    this.loadMetadata();
  }

  private async loadMetadata(): Promise<void> {
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

  async scanForNewIssues(): Promise<void> {
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
        
        // Parse SHOULD_CLOSE from the file
        const content = await Bun.file(file).text();
        const shouldCloseMatch = content.match(/SHOULD_CLOSE:\s*(Yes|No)/i);
        if (shouldCloseMatch) {
          this.metadata.issues[issueNumber].shouldClose = shouldCloseMatch[1].toLowerCase() === "yes";
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