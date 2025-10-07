import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ConfigManager } from "./config-manager";

export interface EditorDefinition {
  name: string;
  cmd: string;
  paths: string[];
}

const EDITOR_CONFIGS: Record<string, EditorDefinition> = {
  zed: {
    name: "Zed",
    cmd: "zed",
    paths: [
      "/usr/local/bin/zed",
      "/opt/homebrew/bin/zed",
      `${process.env.HOME}/.local/bin/zed`,
    ],
  },
  vim: {
    name: "Vim",
    cmd: "vim",
    paths: ["/usr/bin/vim", "/usr/local/bin/vim", "/opt/homebrew/bin/vim"],
  },
  nvim: {
    name: "Neovim",
    cmd: "nvim",
    paths: [
      "/usr/bin/nvim",
      "/usr/local/bin/nvim",
      "/opt/homebrew/bin/nvim",
    ],
  },
  cursor: {
    name: "Cursor",
    cmd: "cursor",
    paths: [
      "/Applications/Cursor.app/Contents/MacOS/Cursor",
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
      "/usr/local/bin/cursor",
    ],
  },
  code: {
    name: "VS Code",
    cmd: "code",
    paths: [
      "/usr/local/bin/code",
      "/opt/homebrew/bin/code",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    ],
  },
};

export class EditorManager {
  private configManager: ConfigManager;
  private availableEditors: Map<string, string> = new Map();

  constructor() {
    this.configManager = new ConfigManager();
    this.detectEditors();
  }

  private detectEditors(): void {
    for (const [key, config] of Object.entries(EDITOR_CONFIGS)) {
      // Check user-configured path first
      const userPath = this.configManager.getEditorPath(key);
      if (userPath && existsSync(userPath)) {
        this.availableEditors.set(key, userPath);
        continue;
      }

      // Check default paths
      for (const path of config.paths) {
        if (existsSync(path)) {
          this.availableEditors.set(key, path);
          break;
        }
      }

      // Fallback to checking if command is in PATH
      if (!this.availableEditors.has(key)) {
        try {
          const result = Bun.spawnSync(["which", config.cmd]);
          if (result.exitCode === 0) {
            const path = result.stdout.toString().trim();
            if (path) {
              this.availableEditors.set(key, path);
            }
          }
        } catch {
          // Command not found, skip
        }
      }
    }
  }

  getAvailableEditors(): Array<{ key: string; name: string; path: string }> {
    const editors: Array<{ key: string; name: string; path: string }> = [];
    for (const [key, path] of this.availableEditors.entries()) {
      const config = EDITOR_CONFIGS[key];
      if (config) {
        editors.push({ key, name: config.name, path });
      }
    }
    return editors;
  }

  getDefaultEditor(): string | undefined {
    // Check user preference first
    const userDefault = this.configManager.getDefaultEditor();
    if (userDefault && this.availableEditors.has(userDefault)) {
      return userDefault;
    }

    // Return first available editor
    const editors = Array.from(this.availableEditors.keys());
    return editors[0];
  }

  async setDefaultEditor(editor: string): Promise<void> {
    if (!this.availableEditors.has(editor)) {
      throw new Error(`Editor '${editor}' is not available`);
    }
    await this.configManager.setDefaultEditor(editor);
  }

  async openFile(filePath: string, editor?: string): Promise<void> {
    const editorKey = editor || this.getDefaultEditor();
    if (!editorKey) {
      throw new Error("No editor available");
    }

    const editorPath = this.availableEditors.get(editorKey);
    if (!editorPath) {
      throw new Error(`Editor '${editorKey}' is not available`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(editorPath, [filePath], {
        detached: true,
        stdio: "ignore",
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to open editor: ${err.message}`));
      });

      proc.unref();
      resolve();
    });
  }

  getEditorName(key: string): string {
    return EDITOR_CONFIGS[key]?.name || key;
  }
}
