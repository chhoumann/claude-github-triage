#!/usr/bin/env bun

import path from "node:path";
import { Command } from "commander";
import { ClaudeAdapter, CodexAdapter } from "./adapters";
import { GitHubClient } from "./github";
import { IssueTriage } from "./issue-triager";
import { ReviewManager } from "./review-manager";
import { EditorManager } from "./editor-manager";
import React from "react";
import { render } from "ink";
import { InboxApp } from "./tui/InboxApp";
import { TriageApp } from "./tui/TriageApp";

const program = new Command();

program
  .name("github-triage")
  .description("AI-powered GitHub issue triage bot")
  .version("1.0.0");

program
  .command("triage")
  .description("Triage GitHub issues for a repository")
  .option("-o, --owner <owner>", "Repository owner")
  .option("-r, --repo <repo>", "Repository name")
  .option(
    "-t, --token <token>",
    "GitHub personal access token",
  )
  .option("-p, --path <path>", "Path to the project codebase")
  .option("-i, --issue <number>", "Specific issue number to triage")
  .option("-s, --state <state>", "Issue state filter (open/closed/all)", "open")
  .option("-l, --labels <labels...>", "Filter by labels")
  .option("--limit <number>", "Maximum number of issues to triage")
  .option("--sort <field>", "Sort issues by: created, updated, comments", "created")
  .option("--direction <direction>", "Sort direction asc|desc", "desc")
  .option("-c, --concurrency <number>", "Number of concurrent Claude Code instances", "3")
  .option("-f, --force", "Force re-triage of already processed issues")
  .option(
    "--adapter <type>",
    "AI agent adapter to use: claude or codex",
    "claude",
  )
  .option(
    "--apply",
    "Apply recommendations to GitHub (add labels, close issues)",
  )
  .option(
    "--interactive",
    "Use interactive TUI mode (default: true)",
    true,
  )
  .option(
    "--no-interactive",
    "Use non-interactive mode (good for CI/automation)",
  )
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      
      const ctx = await ProjectContext.resolve({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
        codePath: options.path,
      });
      
      await ctx.ensureDirs();
      const migrated = await ctx.migrateLegacyIfNeeded();
      
      const adapterType = options.adapter || "claude";
      const adapter = adapterType === "codex" ? new CodexAdapter() : new ClaudeAdapter();
      const triager = new IssueTriage(
        ctx.token,
        adapter,
        adapterType,
        ctx.paths.triage,
        ctx.paths.debug,
        ctx.paths.root,
        ctx.repoSlug
      );
      const projectPath = path.resolve(ctx.codePath);

      if (options.issue) {
        const issueNum = parseInt(options.issue);
        const resultPath = path.join(ctx.paths.triage, `issue-${issueNum}-triage.md`);
        const resultFile = Bun.file(resultPath);
        const exists = await resultFile.exists();
        
        console.log(`🔍 Triaging issue #${issueNum} for ${ctx.owner}/${ctx.repo}`);
        console.log(`📁 Using codebase at: ${projectPath}`);
        console.log(`🤖 Using adapter: ${adapterType}`);
        
        if (exists && options.force) {
          console.log(`🔄 Force mode: re-triaging existing issue\n`);
        } else if (exists) {
          console.log(`✅ Issue already triaged. Use --force to re-triage.\n`);
          return;
        } else {
          console.log();
        }
        
        console.log(`Analyzing issue #${issueNum}...`);
        await triager.triageIssue(
          ctx.owner,
          ctx.repo,
          issueNum,
          projectPath,
          options.force,
        );

        console.log(
          `\n📋 Analysis complete. Results saved to: ${resultPath}`,
        );
      } else {
        // Multiple issues - use TUI or non-interactive mode
        if (options.interactive !== false) {
          // Interactive TUI mode (default)
          render(
            React.createElement(TriageApp, {
              owner: ctx.owner,
              repo: ctx.repo,
              projectPath,
              triagePath: ctx.paths.triage,
              debugPath: ctx.paths.debug,
              projectRoot: ctx.paths.root,
              repoSlug: ctx.repoSlug,
              githubToken: ctx.token,
              options: {
                state: options.state as "open" | "closed" | "all",
                labels: options.labels,
                limit: options.limit ? parseInt(options.limit) : undefined,
                sort: options.sort as "created" | "updated" | "comments",
                direction: options.direction as "asc" | "desc",
                concurrency: parseInt(options.concurrency),
                force: options.force,
              },
            })
          );
        } else {
          // Non-interactive mode (for CI/automation)
          await triager.triageMultipleIssues(
            ctx.owner,
            ctx.repo,
            projectPath,
            {
              state: options.state as "open" | "closed" | "all",
              labels: options.labels,
              limit: options.limit ? parseInt(options.limit) : undefined,
              sort: options.sort,
              direction: options.direction,
              concurrency: parseInt(options.concurrency),
              force: options.force,
            },
          );
        }
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("test")
  .description("Test GitHub connection")
  .option("-o, --owner <owner>", "Repository owner")
  .option("-r, --repo <repo>", "Repository name")
  .option(
    "-t, --token <token>",
    "GitHub personal access token",
  )
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      
      const ctx = await ProjectContext.resolve({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
      });
      
      const client = new GitHubClient(ctx.token);
      const repo = await client.getRepository(ctx.owner, ctx.repo);

      console.log("✅ Successfully connected to GitHub!");
      console.log(`📦 Repository: ${repo.full_name}`);
      console.log(`⭐ Stars: ${repo.stargazers_count}`);
      console.log(`🍴 Forks: ${repo.forks_count}`);
      console.log(`🐛 Open Issues: ${repo.open_issues_count}`);
    } catch (error) {
      console.error("❌ Failed to connect:", error);
      process.exit(1);
    }
  });

program
  .command("inbox")
  .description("View triaged issues in interactive TUI (default) or table mode")
  .option("-f, --filter <type>", "Filter by status: all, read, unread", "all")
  .option("-s, --sort <field>", "Sort by: number, date", "number")
  .option("--close <filter>", "Filter by SHOULD_CLOSE: yes|no|unknown|not-no")
  .option("--table", "Use legacy table mode instead of interactive TUI")
  .option("--include-all", "Include all GitHub issues, not just triaged ones")
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const ctx = await ProjectContext.resolve({});
      await ctx.ensureDirs();
      await ctx.migrateLegacyIfNeeded();

      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);

      // Sync all issues from GitHub if requested
      if (options.includeAll) {
        console.log(`🔄 Syncing all issues from ${ctx.owner}/${ctx.repo}...`);
        const result = await reviewManager.syncAllIssuesFromGitHub(ctx.token, ctx.owner, ctx.repo);
        console.log(`✨ Synced ${result.total} issues (${result.triaged} triaged, ${result.untriaged} untriaged)\n`);
      }

      if (!options.table) {
        render(
          React.createElement(InboxApp, {
            filter: options.filter as "all" | "read" | "unread",
            sort: options.sort as "number" | "date",
            closeFilter: options.close as "yes" | "no" | "unknown" | "not-no" | undefined,
          })
        );
        return;
      }

      await reviewManager.scanForNewIssues();
      const issues = await reviewManager.getInbox(
        options.filter as "all" | "read" | "unread",
        options.sort as "number" | "date",
        options.close as "yes" | "no" | "unknown" | "not-no" | undefined,
      );

      const stats = await reviewManager.getStats();
      
      console.log(`\n📥 Triage Inbox - ${stats.unread} unread, ${stats.read} read (${stats.total} total)\n`);
      
      if (issues.length === 0) {
        console.log("No issues found matching your filter.");
        return;
      }
      
      // Print header
      console.log("┌─────────┬────────────┬───────────────────────┬────────────────────────┬──────────┐");
      console.log("│ Issue # │ Status     │ Triaged               │ Reviewed               │ Close?   │");
      console.log("├─────────┼────────────┼───────────────────────┼────────────────────────┼──────────┤");
      
      for (const issue of issues) {
        const issueNum = `#${issue.issueNumber}`.padEnd(7);
        const status = issue.reviewStatus === "read" ? "✅ Read  " : "📄 Unread";
        const triageDate = new Date(issue.triageDate).toLocaleString();
        const reviewDate = issue.reviewDate 
          ? new Date(issue.reviewDate).toLocaleString() 
          : "Not reviewed";
        const shouldClose = issue.shouldClose === true ? "❌ Yes   " : 
                          issue.shouldClose === false ? "✅ No    " : "❓ Unknown";
        
        console.log(`│ ${issueNum} │ ${status} │ ${triageDate.padEnd(21)} │ ${reviewDate.padEnd(22)} │ ${shouldClose} │`);
      }
      
      console.log("└─────────┴────────────┴───────────────────────┴────────────────────────┴──────────┘");
      
      if (stats.unread > 0) {
        console.log(`\n💡 Tip: Run 'bun cli.ts inbox' (without --table) for interactive TUI mode`);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("review")
  .description("Review triaged issues interactively")
  .option("-i, --issue <number>", "Review specific issue number")
  .option("-a, --all", "Review all unread issues")
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const ctx = await ProjectContext.resolve({});
      await ctx.ensureDirs();
      await ctx.migrateLegacyIfNeeded();
      
      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
      await reviewManager.scanForNewIssues();
      
      if (options.issue) {
        const issueNumber = parseInt(options.issue);
        await reviewIssue(issueNumber, reviewManager, ctx.paths.triage);
      } else {
        // Review next unread or all
        const unreadIssues = await reviewManager.getInbox("unread", "number");
        
        if (unreadIssues.length === 0) {
          console.log("✨ No unread issues to review!");
          return;
        }
        
        if (options.all) {
          // Review all unread issues
          console.log(`📚 Reviewing ${unreadIssues.length} unread issues...\n`);
          
          for (let i = 0; i < unreadIssues.length; i++) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Issue ${i + 1} of ${unreadIssues.length}`);
            console.log(`${"=".repeat(80)}\n`);
            
            const issue = unreadIssues[i];
            if (issue) {
              await reviewIssue(issue.issueNumber, reviewManager, ctx.paths.triage);
            }
            
            if (i < unreadIssues.length - 1) {
              console.log("\nPress Enter to continue to next issue...");
              await Bun.stdin.text(); // Wait for user input
            }
          }
          
          console.log("\n✅ All issues reviewed!");
        } else {
          const nextIssue = unreadIssues[0];
          if (nextIssue) {
            await reviewIssue(nextIssue.issueNumber, reviewManager, ctx.paths.triage);
          }
          
          if (unreadIssues.length > 1) {
            console.log(`\n💡 ${unreadIssues.length - 1} more unread issues. Use 'bun cli.ts review --all' to review them all.`);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("mark")
  .description("Mark issues as read/unread")
  .argument("[issue]", "Issue number to mark (or use --all)")
  .option("-r, --read", "Mark as read")
  .option("-u, --unread", "Mark as unread")
  .option("-a, --all", "Mark all issues")
  .action(async (issue, options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const ctx = await ProjectContext.resolve({});
      await ctx.ensureDirs();

      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
      await reviewManager.loadMetadata();

      const hasAction = options.read || options.unread;
      if (!hasAction) {
        console.error("❌ Please specify --read or --unread");
        process.exit(1);
      }

      if (options.all) {
        if (options.read) {
          await reviewManager.markAllAsRead();
          console.log("✅ All issues marked as read");
        } else {
          console.error("❌ Only --read is supported with --all");
        }
      } else if (issue) {
        const issueNumber = parseInt(issue);
        if (options.read) {
          await reviewManager.markAsRead(issueNumber);
          console.log(`✅ Issue #${issueNumber} marked as read`);
        } else if (options.unread) {
          await reviewManager.markAsUnread(issueNumber);
          console.log(`✅ Issue #${issueNumber} marked as unread`);
        }
      } else {
        console.error("❌ Please specify an issue number or use --all");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("sync")
  .description("Sync with GitHub - mark closed issues as read and track their GitHub status")
  .option("-o, --owner <owner>", "Repository owner")
  .option("-r, --repo <repo>", "Repository name")
  .option(
    "-t, --token <token>",
    "GitHub personal access token",
  )
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const { syncClosedIssues } = await import("./sync-service");
      const ctx = await ProjectContext.resolve({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
      });

      await ctx.ensureDirs();

      console.log(`🔄 Syncing with ${ctx.owner}/${ctx.repo}...`);

      const result = await syncClosedIssues(ctx);

      console.log(`\n✨ Sync complete!`);
      if (result.updated > 0) {
        console.log(`📖 Marked ${result.updated} closed issues as read and closed on GitHub`);
      }
      if (result.alreadyMarked > 0) {
        console.log(`✓ ${result.alreadyMarked} closed issues were already marked`);
      }

      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
      const stats = await reviewManager.getStats();
      console.log(`\n📊 Updated stats: ${stats.unread} unread, ${stats.read} read (${stats.total} total)`);
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("migrate")
  .description("Migrate status fields - sync with GitHub and remove legacy isDone field")
  .option("-o, --owner <owner>", "Repository owner")
  .option("-r, --repo <repo>", "Repository name")
  .option(
    "-t, --token <token>",
    "GitHub personal access token",
  )
  .action(async (options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const ctx = await ProjectContext.resolve({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
      });

      await ctx.ensureDirs();

      console.log(`🔄 Migrating status fields for ${ctx.owner}/${ctx.repo}...`);
      console.log(`📡 Fetching GitHub issue states...\n`);

      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
      const result = await reviewManager.migrateStatusFields(ctx.token);

      console.log(`\n✨ Migration complete!`);
      console.log(`📊 Summary:`);
      console.log(`  Total issues: ${result.totalIssues}`);
      console.log(`  🔒 Closed on GitHub: ${result.closedOnGitHub}`);
      console.log(`  ✅ Open on GitHub: ${result.openOnGitHub}`);
      console.log(`  🧹 Removed isDone field: ${result.removedIsDone}`);
      if (result.notFoundOnGitHub > 0) {
        console.log(`  ⚠️  Not found on GitHub: ${result.notFoundOnGitHub}`);
      }

      console.log(`\n💡 Your status model is now simpler:`);
      console.log(`   - Unread/Read: Your review status`);
      console.log(`   - 🔒: Closed on GitHub (auto-synced)`);
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("open")
  .description("Open a triaged issue in your preferred editor")
  .argument("<issue>", "Issue number to open")
  .option("-e, --editor <editor>", "Editor to use (zed, vim, nvim, cursor, code)")
  .action(async (issue, options) => {
    try {
      const { ProjectContext } = await import("./project-context");
      const ctx = await ProjectContext.resolve({});
      await ctx.ensureDirs();
      
      const issueNumber = parseInt(issue);
      const filePath = `${ctx.paths.triage}/issue-${issueNumber}-triage.md`;
      const file = Bun.file(filePath);
      
      if (!(await file.exists())) {
        console.error(`❌ Triage file not found: ${filePath}`);
        console.log(`\n💡 Tip: Run 'bun cli.ts triage' to generate triage results first`);
        process.exit(1);
      }

      const editorManager = new EditorManager();
      const availableEditors = editorManager.getAvailableEditors();
      
      if (availableEditors.length === 0) {
        console.error("❌ No editors available");
        console.log("\n💡 Supported editors: Zed, Vim, Neovim, Cursor, VS Code");
        process.exit(1);
      }

      let editorKey = options.editor;
      
      // If no editor specified, use default or show options
      if (!editorKey) {
        editorKey = editorManager.getDefaultEditor();
        if (!editorKey) {
          console.log("📝 Available editors:");
          availableEditors.forEach((editor, idx) => {
            console.log(`  ${idx + 1}. ${editor.name} (${editor.key})`);
          });
          console.log("\n💡 Use --editor <editor> to specify, or set a default with 'bun cli.ts config set-editor <editor>'");
          process.exit(0);
        }
      }

      const absolutePath = `${process.cwd()}/${filePath}`;
      await editorManager.openFile(absolutePath, editorKey);
      
      const editorName = editorManager.getEditorName(editorKey);
      console.log(`✅ Opened issue #${issueNumber} in ${editorName}`);
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("project")
  .description("Manage projects")
  .argument("<action>", "Action: add, update, switch, list, remove")
  .option("-o, --owner <owner>", "Repository owner")
  .option("-r, --repo <repo>", "Repository name")
  .option("-t, --token <token>", "GitHub token or env:VAR")
  .option("-p, --path <path>", "Path to codebase")
  .action(async (action, options) => {
    try {
      const { ConfigManager } = await import("./config-manager");
      const configManager = new ConfigManager();

      if (action === "add") {
        if (!options.owner || !options.repo) {
          console.error("❌ Please specify owner and repo");
          console.error("Example: bun cli.ts project add -o owner -r repo -t env:GITHUB_TOKEN");
          process.exit(1);
        }

        const projectConfig = {
          owner: options.owner,
          repo: options.repo,
          token: options.token || "env:GITHUB_TOKEN",
          codePath: options.path,
        };

        await configManager.upsertProject(projectConfig);
        const projectId = `${options.owner}/${options.repo}`;
        
        if (!configManager.getActiveProject()) {
          await configManager.setActiveProject(projectId);
          console.log(`✅ Added and activated project: ${projectId}`);
        } else {
          console.log(`✅ Added project: ${projectId}`);
          console.log(`💡 Run 'bun cli.ts project switch ${projectId}' to activate it`);
        }
      } else if (action === "switch") {
        const projectId = options.owner && options.repo 
          ? `${options.owner}/${options.repo}`
          : undefined;

        if (!projectId) {
          console.error("❌ Please specify project in format: owner/repo");
          console.error("Example: bun cli.ts project switch -o owner -r repo");
          process.exit(1);
        }

        const project = configManager.getProject(projectId);
        if (!project) {
          console.error(`❌ Project not found: ${projectId}`);
          console.log("\n💡 Add it first with: bun cli.ts project add -o owner -r repo -t token");
          process.exit(1);
        }

        await configManager.setActiveProject(projectId);
        console.log(`✅ Switched to project: ${projectId}`);
      } else if (action === "update") {
        if (!options.owner || !options.repo) {
          console.error("❌ Please specify project to update");
          console.error("Example: bun cli.ts project update -o owner -r repo -p /new/path");
          process.exit(1);
        }

        const projectId = `${options.owner}/${options.repo}`;
        const existingProject = configManager.getProject(projectId);

        if (!existingProject) {
          console.error(`❌ Project not found: ${projectId}`);
          console.log("\n💡 Add it first with: bun cli.ts project add -o owner -r repo -t token");
          process.exit(1);
        }

        // Merge existing config with new options
        const updatedConfig = {
          owner: options.owner,
          repo: options.repo,
          token: options.token || existingProject.token,
          codePath: options.path || existingProject.codePath,
        };

        await configManager.upsertProject(updatedConfig);
        console.log(`✅ Updated project: ${projectId}`);
        
        if (options.path) {
          console.log(`   Path: ${options.path}`);
        }
        if (options.token) {
          console.log(`   Token: ${options.token}`);
        }
      } else if (action === "list") {
        const projects = configManager.listProjects();
        const activeProject = configManager.getActiveProject();

        if (projects.length === 0) {
          console.log("No projects configured");
          console.log("\n💡 Add one with: bun cli.ts project add -o owner -r repo -t token");
          return;
        }

        console.log("📋 Projects:\n");
        projects.forEach((project) => {
          const isActive = project.id === activeProject;
          const marker = isActive ? "✓" : " ";
          console.log(`${marker} ${project.id}`);
          
          if (project.codePath) {
            console.log(`    Path: ${project.codePath}`);
          } else {
            console.log(`    Path: ⚠️  NOT SET (triage won't have codebase access!)`);
          }
          
          console.log(`    Token: ${project.token || "Not set"}`);
          
          if (project.dataDir) {
            console.log(`    Data: ${project.dataDir}`);
          }
          
          console.log();
        });
      } else if (action === "remove") {
        if (!options.owner || !options.repo) {
          console.error("❌ Please specify project to remove");
          console.error("Example: bun cli.ts project remove -o owner -r repo");
          process.exit(1);
        }

        const projectId = `${options.owner}/${options.repo}`;
        const existingProject = configManager.getProject(projectId);

        if (!existingProject) {
          console.error(`❌ Project not found: ${projectId}`);
          process.exit(1);
        }

        await configManager.removeProject(projectId);
        console.log(`✅ Removed project: ${projectId}`);

        // If this was the active project, clear it
        if (configManager.getActiveProject() === projectId) {
          const remainingProjects = configManager.listProjects();
          if (remainingProjects.length > 0) {
            await configManager.setActiveProject(remainingProjects[0]!.id);
            console.log(`💡 Switched to: ${remainingProjects[0]!.id}`);
          } else {
            await configManager.setActiveProject("");
            console.log(`💡 No projects remaining`);
          }
        }
      } else {
        console.error(`❌ Unknown action: ${action}`);
        console.log("Available actions: add, update, switch, list, remove");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Manage configuration")
  .argument("<action>", "Action: show, set-editor")
  .argument("[value]", "Value for the action")
  .action(async (action, value) => {
    try {
      const editorManager = new EditorManager();
      
      if (action === "show") {
        const availableEditors = editorManager.getAvailableEditors();
        const defaultEditor = editorManager.getDefaultEditor();
        const { ConfigManager } = await import("./config-manager");
        const configManager = new ConfigManager();
        const githubRepo = configManager.getGitHubRepo();
        const activeProject = configManager.getActiveProject();
        const projects = configManager.listProjects();
        
        console.log("📝 Configuration:");
        console.log(`\nActive Project: ${activeProject || "None"}`);
        console.log(`Total Projects: ${projects.length}`);
        console.log(`\nLegacy GitHub Repo: ${githubRepo || "Not set"}`);
        console.log(`\nDefault editor: ${defaultEditor ? editorManager.getEditorName(defaultEditor) : "Not set"}`);
        console.log("\nAvailable editors:");
        availableEditors.forEach((editor) => {
          const isDefault = editor.key === defaultEditor;
          console.log(`  ${isDefault ? "✓" : " "} ${editor.name} (${editor.key}) - ${editor.path}`);
        });
      } else if (action === "set-repo") {
        if (!value) {
          console.error("❌ Please specify a repo in format: owner/repo");
          console.error("Example: bun run src/cli.ts config set-repo chhoumann/quickadd");
          process.exit(1);
        }
        
        const { ConfigManager } = await import("./config-manager");
        const configManager = new ConfigManager();
        await configManager.setGitHubRepo(value);
        console.log(`✅ GitHub repo set to: ${value}`);
      } else if (action === "set-editor") {
        if (!value) {
          console.error("❌ Please specify an editor key");
          process.exit(1);
        }
        
        await editorManager.setDefaultEditor(value);
        console.log(`✅ Default editor set to: ${editorManager.getEditorName(value)}`);
      } else {
        console.error(`❌ Unknown action: ${action}`);
        console.log("Available actions: show, set-repo, set-editor");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

async function reviewIssue(issueNumber: number, reviewManager: ReviewManager, triagePath: string): Promise<void> {
  const triageFile = Bun.file(`${triagePath}/issue-${issueNumber}-triage.md`);
  
  if (!(await triageFile.exists())) {
    console.error(`❌ Triage file not found for issue #${issueNumber}`);
    return;
  }
  
  const content = await triageFile.text();
  
  console.log(`📋 Issue #${issueNumber}`);
  console.log("-".repeat(80));
  console.log(content);
  console.log("-".repeat(80));
  
  await reviewManager.markAsRead(issueNumber);
  console.log(`\n✅ Issue #${issueNumber} marked as read`);
}

async function applyRecommendation(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  recommendation: any,
) {
  const client = new GitHubClient(token);

  try {
    const updates: any = {};

    if (recommendation.shouldClose) {
      updates.state = "closed";
    }

    if (recommendation.labels.length > 0) {
      updates.labels = recommendation.labels;
    }

    if (Object.keys(updates).length > 0) {
      await client.updateIssue(owner, repo, issueNumber, updates);
      console.log(`✅ Updated issue #${issueNumber}`);
    }

    if (recommendation.suggestedResponse) {
      await client.createComment(
        owner,
        repo,
        issueNumber,
        recommendation.suggestedResponse,
      );
      console.log(`💬 Added comment to issue #${issueNumber}`);
    }
  } catch (error) {
    console.error(`❌ Failed to update issue #${issueNumber}:`, error);
  }
}

program.parse();
