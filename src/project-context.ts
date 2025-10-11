import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync, renameSync, readdirSync } from "node:fs";
import { ConfigManager } from "./config-manager";

export interface ProjectPaths {
  root: string;
  triage: string;
  debug: string;
  metadataFile: string;
}

export class ProjectContext {
  constructor(
    public owner: string,
    public repo: string,
    public token: string,
    public codePath: string,
    public paths: ProjectPaths
  ) {}

  static defaultDataRoot(): string {
    return join(homedir(), ".github-triage", "data");
  }

  static resolveToken(token?: string): string | undefined {
    if (!token) return undefined;
    if (token.startsWith("env:")) {
      const envVar = token.slice(4);
      return process.env[envVar];
    }
    return token;
  }

  static async resolve(opts: {
    owner?: string;
    repo?: string;
    token?: string;
    codePath?: string;
  }): Promise<ProjectContext> {
    const cm = new ConfigManager();
    let id = cm.getActiveProject();
    let owner = opts.owner;
    let repo = opts.repo;
    let token = opts.token;
    let codePath = opts.codePath;

    if (!owner || !repo || !token || !codePath) {
      const legacyRepo = cm.getGitHubRepo();
      if (!id && legacyRepo) id = legacyRepo;

      const pc = id ? cm.getProject(id) : undefined;
      owner = owner || pc?.owner;
      repo = repo || pc?.repo;
      token = token || (pc ? cm.resolveToken(pc) : undefined);
      codePath = codePath || pc?.codePath;
    }

    if (!owner || !repo) {
      throw new Error(
        "No project selected. Pass -o/-r or run: bun cli.ts project add -o owner -r repo -t token"
      );
    }

    const projectId = `${owner}/${repo}`;
    const dataRoot =
      cm.getProject(projectId)?.dataDir ||
      join(ProjectContext.defaultDataRoot(), owner, repo);

    const paths: ProjectPaths = {
      root: dataRoot,
      triage: join(dataRoot, "triage"),
      debug: join(dataRoot, "debug"),
      metadataFile: join(dataRoot, ".triage-metadata.json"),
    };

    const resolvedToken =
      ProjectContext.resolveToken(token) ||
      ProjectContext.resolveToken(process.env.GITHUB_TOKEN);

    if (!resolvedToken) {
      throw new Error(
        "GitHub token not found. Set token in project config or pass -t flag or set GITHUB_TOKEN env var"
      );
    }

    return new ProjectContext(
      owner,
      repo,
      resolvedToken,
      codePath || process.cwd(),
      paths
    );
  }

  async ensureDirs(): Promise<void> {
    [this.paths.root, this.paths.triage, this.paths.debug].forEach((p) => {
      if (!existsSync(p)) {
        mkdirSync(p, { recursive: true });
      }
    });
  }

  async migrateLegacyIfNeeded(): Promise<boolean> {
    if (!existsSync("results")) {
      return false;
    }

    const destEmpty =
      !existsSync(this.paths.metadataFile) &&
      (!existsSync(this.paths.triage) ||
        readdirSync(this.paths.triage).length === 0);

    if (!destEmpty) {
      return false;
    }

    console.log(
      `📦 Migrating legacy results/ directory to ${this.paths.root}...`
    );

    await this.ensureDirs();

    if (existsSync("results/.triage-metadata.json")) {
      renameSync("results/.triage-metadata.json", this.paths.metadataFile);
      console.log("  ✓ Moved metadata file");
    }

    let triageCount = 0;
    let debugCount = 0;

    const files = readdirSync("results");
    for (const f of files) {
      if (/^issue-\d+-triage\.md$/.test(f)) {
        renameSync(`results/${f}`, join(this.paths.triage, f));
        triageCount++;
      } else if (/^issue-\d+-triage-debug\.json$/.test(f)) {
        renameSync(`results/${f}`, join(this.paths.debug, f));
        debugCount++;
      }
    }

    console.log(`  ✓ Moved ${triageCount} triage files`);
    console.log(`  ✓ Moved ${debugCount} debug files`);
    console.log(`✨ Migration complete!\n`);

    return true;
  }

  get repoSlug(): string {
    return `${this.owner}/${this.repo}`;
  }
}
