import { Octokit } from '@octokit/rest';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async getRepository(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async listIssues(owner: string, repo: string, options?: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    since?: string;
    page?: number;
    per_page?: number;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
  }) {
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: options?.state || 'open',
      labels: options?.labels?.join(','),
      since: options?.since,
      page: options?.page || 1,
      per_page: options?.per_page || 30,
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.direction ? { direction: options.direction } : {}),
      mediaType: {
        previews: ['squirrel-girl'], // include reactions summary
      },
    });
    return data;
  }

  async getIssue(owner: string, repo: string, issue_number: number) {
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number,
    });
    return data;
  }

  async updateIssue(owner: string, repo: string, issue_number: number, update: {
    state?: 'open' | 'closed';
    labels?: string[];
    title?: string;
    body?: string;
  }) {
    const { data } = await this.octokit.issues.update({
      owner,
      repo,
      issue_number,
      ...update,
    });
    return data;
  }

  async createComment(owner: string, repo: string, issue_number: number, body: string) {
    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
    return data;
  }

  async getRepositoryContent(owner: string, repo: string, path: string = '') {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });
      return data;
    } catch {
      return null;
    }
  }

  async *listIssuesPaginated(owner: string, repo: string, options?: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    since?: string;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
  }) {
    let page = 1;
    const perPage = 100; // GitHub max per page
    
    while (true) {
      const issues = await this.listIssues(owner, repo, {
        ...options,
        page,
        per_page: perPage,
      });
      
      // Yield each issue individually
      for (const issue of issues) {
        yield issue;
      }
      
      // If we got fewer issues than per_page, we've reached the end
      if (issues.length < perPage) {
        break;
      }
      
      page++;
    }
  }
}