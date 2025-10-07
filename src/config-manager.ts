import { join } from "node:path";
import { homedir } from "node:os";

export interface EditorConfig {
  defaultEditor?: string;
  editorPaths?: Record<string, string>;
  githubRepo?: string; // Format: "owner/repo"
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
}
