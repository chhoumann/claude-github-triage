import { join } from "node:path";
import { homedir } from "node:os";

export interface ProjectConfig {
  owner: string;
  repo: string;
  token?: string;
  codePath?: string;
  dataDir?: string;
}

export interface EditorConfig {
  defaultEditor?: string;
  editorPaths?: Record<string, string>;
  githubRepo?: string;
  projects?: Record<string, ProjectConfig>;
  activeProject?: string;
}

export class ConfigManager {
  private configPath: string;
  private config: EditorConfig = {};

  constructor() {
    this.configPath = join(homedir(), ".github-triage-config.json");
    // Load config synchronously
    this.loadConfigSync();
  }

  private loadConfigSync(): void {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
      }
    } catch (error) {
      // Config doesn't exist or is invalid, use defaults
      this.config = {};
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const file = Bun.file(this.configPath);
      if (await file.exists()) {
        const content = await file.text();
        this.config = JSON.parse(content);
      }
    } catch (error) {
      // Config doesn't exist or is invalid, use defaults
      this.config = {};
    }
  }

  async saveConfig(): Promise<void> {
    await Bun.write(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getDefaultEditor(): string | undefined {
    return this.config.defaultEditor;
  }

  async setDefaultEditor(editor: string): Promise<void> {
    this.config.defaultEditor = editor;
    await this.saveConfig();
  }

  getEditorPath(editor: string): string | undefined {
    return this.config.editorPaths?.[editor];
  }

  async setEditorPath(editor: string, path: string): Promise<void> {
    if (!this.config.editorPaths) {
      this.config.editorPaths = {};
    }
    this.config.editorPaths[editor] = path;
    await this.saveConfig();
  }

  getAllConfig(): EditorConfig {
    return this.config;
  }

  getGitHubRepo(): string | undefined {
    return this.config.githubRepo;
  }

  async setGitHubRepo(repo: string): Promise<void> {
    this.config.githubRepo = repo;
    await this.saveConfig();
  }

  getActiveProject(): string | undefined {
    return this.config.activeProject;
  }

  async setActiveProject(id: string): Promise<void> {
    this.config.activeProject = id;
    await this.saveConfig();
  }

  getProject(id: string): ProjectConfig | undefined {
    return this.config.projects?.[id];
  }

  async upsertProject(cfg: ProjectConfig): Promise<void> {
    if (!this.config.projects) {
      this.config.projects = {};
    }
    const id = `${cfg.owner}/${cfg.repo}`;
    this.config.projects[id] = cfg;
    await this.saveConfig();
  }

  listProjects(): Array<ProjectConfig & { id: string }> {
    if (!this.config.projects) return [];
    return Object.entries(this.config.projects).map(([id, config]) => ({
      ...config,
      id,
    }));
  }

  resolveToken(cfg: ProjectConfig): string | undefined {
    if (!cfg.token) return undefined;
    if (cfg.token.startsWith("env:")) {
      const envVar = cfg.token.slice(4);
      return process.env[envVar];
    }
    return cfg.token;
  }
}
