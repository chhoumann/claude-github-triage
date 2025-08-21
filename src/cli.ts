#!/usr/bin/env bun

import path from "node:path";
import { Command } from "commander";
import { GitHubClient } from "./github";
import { IssueTriage } from "./issue-triager";
import { ReviewManager } from "./review-manager";

const program = new Command();

program
  .name("github-triage")
  .description("AI-powered GitHub issue triage bot")
  .version("1.0.0");

program
  .command("triage")
  .description("Triage GitHub issues for a repository")
  .requiredOption("-o, --owner <owner>", "Repository owner")
  .requiredOption("-r, --repo <repo>", "Repository name")
  .requiredOption(
    "-t, --token <token>",
    "GitHub personal access token",
    process.env.GITHUB_TOKEN,
  )
  .option("-p, --path <path>", "Path to the project codebase", process.cwd())
  .option("-i, --issue <number>", "Specific issue number to triage")
  .option("-s, --state <state>", "Issue state filter (open/closed/all)", "open")
  .option("-l, --labels <labels...>", "Filter by labels")
  .option("--limit <number>", "Maximum number of issues to triage")
  .option("--sort <field>", "Sort issues by: created, updated, comments", "created")
  .option("--direction <direction>", "Sort direction asc|desc", "desc")
  .option("-c, --concurrency <number>", "Number of concurrent Claude Code instances", "3")
  .option("-f, --force", "Force re-triage of already processed issues")
  .option(
    "--apply",
    "Apply recommendations to GitHub (add labels, close issues)",
  )
  .action(async (options) => {
    try {
      const triager = new IssueTriage(options.token);
      const projectPath = path.resolve(options.path);

      console.log(`🔍 Triaging issues for ${options.owner}/${options.repo}`);
      console.log(`📁 Using codebase at: ${projectPath}\n`);

      if (options.issue) {
        // Triage single issue
        console.log(`Analyzing issue #${options.issue}...`);
        await triager.triageIssue(
          options.owner,
          options.repo,
          parseInt(options.issue),
          projectPath,
          options.force,
        );

        console.log(
          `\n📋 Analysis complete. Results saved to: results/issue-${options.issue}-triage.md`,
        );
      } else {
        // Triage multiple issues
        await triager.triageMultipleIssues(
          options.owner,
          options.repo,
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

        console.log(
          `\n📊 Triage for multiple issues complete. Results saved to: results/`,
        );
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

program
  .command("test")
  .description("Test GitHub connection")
  .requiredOption("-o, --owner <owner>", "Repository owner")
  .requiredOption("-r, --repo <repo>", "Repository name")
  .requiredOption(
    "-t, --token <token>",
    "GitHub personal access token",
    process.env.GITHUB_TOKEN,
  )
  .action(async (options) => {
    try {
      const client = new GitHubClient(options.token);
      const repo = await client.getRepository(options.owner, options.repo);

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
  .description("View triaged issues and their review status")
  .option("-f, --filter <type>", "Filter by status: all, read, unread", "all")
  .option("-s, --sort <field>", "Sort by: number, date", "number")
  .option("--close <filter>", "Filter by SHOULD_CLOSE: yes|no|unknown|not-no")
  .action(async (options) => {
    try {
      const reviewManager = new ReviewManager();
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
        console.log(`\n💡 Tip: Use 'bun cli.ts review' to start reviewing unread issues`);
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
      const reviewManager = new ReviewManager();
      
      if (options.issue) {
        // Review specific issue
        const issueNumber = parseInt(options.issue);
        await reviewIssue(issueNumber, reviewManager);
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
              await reviewIssue(issue.issueNumber, reviewManager);
            }
            
            if (i < unreadIssues.length - 1) {
              console.log("\nPress Enter to continue to next issue...");
              await Bun.stdin.text(); // Wait for user input
            }
          }
          
          console.log("\n✅ All issues reviewed!");
        } else {
          // Review next unread
          const nextIssue = unreadIssues[0];
          if (nextIssue) {
            await reviewIssue(nextIssue.issueNumber, reviewManager);
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
  .description("Mark issues as read or unread")
  .argument("[issue]", "Issue number to mark (or use --all)")
  .option("-r, --read", "Mark as read")
  .option("-u, --unread", "Mark as unread")
  .option("-a, --all", "Mark all issues")
  .action(async (issue, options) => {
    try {
      const reviewManager = new ReviewManager();
      
      if (!options.read && !options.unread) {
        console.error("❌ Please specify --read or --unread");
        process.exit(1);
      }
      
      if (options.all) {
        if (options.read) {
          await reviewManager.markAllAsRead();
          console.log("✅ All issues marked as read");
        } else {
          console.error("❌ Marking all as unread is not supported");
        }
      } else if (issue) {
        const issueNumber = parseInt(issue);
        if (options.read) {
          await reviewManager.markAsRead(issueNumber);
          console.log(`✅ Issue #${issueNumber} marked as read`);
        } else {
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
  .description("Sync with GitHub - mark closed issues as read")
  .requiredOption("-o, --owner <owner>", "Repository owner")
  .requiredOption("-r, --repo <repo>", "Repository name")
  .requiredOption(
    "-t, --token <token>",
    "GitHub personal access token",
    process.env.GITHUB_TOKEN,
  )
  .action(async (options) => {
    try {
      const githubClient = new GitHubClient(options.token);
      const reviewManager = new ReviewManager();
      
      console.log(`🔄 Syncing with ${options.owner}/${options.repo}...`);
      
      let page = 1;
      let totalMarked = 0;
      const alreadyMarked: number[] = [];
      
      // Get all closed issues
      while (true) {
        const issues = await githubClient.listIssues(options.owner, options.repo, {
          state: "closed",
          per_page: 100,
          page,
        });
        
        if (issues.length === 0) break;
        
        for (const issue of issues) {
          // Check if we have a triage file for this issue
          const triageFile = Bun.file(`results/issue-${issue.number}-triage.md`);
          if (await triageFile.exists()) {
            // Get current metadata
            const metadata = await reviewManager.getInbox("all");
            const issueMetadata = metadata.find(m => m.issueNumber === issue.number);
            
            if (issueMetadata && issueMetadata.reviewStatus === "unread") {
              await reviewManager.markAsRead(issue.number);
              console.log(`✅ Marked issue #${issue.number} as read (closed)`);
              totalMarked++;
            } else if (issueMetadata && issueMetadata.reviewStatus === "read") {
              alreadyMarked.push(issue.number);
            }
          }
        }
        
        if (issues.length < 100) break;
        page++;
      }
      
      console.log(`\n✨ Sync complete!`);
      if (totalMarked > 0) {
        console.log(`📖 Marked ${totalMarked} closed issues as read`);
      }
      if (alreadyMarked.length > 0) {
        console.log(`✓ ${alreadyMarked.length} closed issues were already marked as read`);
      }
      
      // Show updated stats
      const stats = await reviewManager.getStats();
      console.log(`\n📊 Updated stats: ${stats.unread} unread, ${stats.read} read (${stats.total} total)`);
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

async function reviewIssue(issueNumber: number, reviewManager: ReviewManager): Promise<void> {
  const triageFile = Bun.file(`results/issue-${issueNumber}-triage.md`);
  
  if (!(await triageFile.exists())) {
    console.error(`❌ Triage file not found for issue #${issueNumber}`);
    return;
  }
  
  const content = await triageFile.text();
  
  // Display the issue
  console.log(`📋 Issue #${issueNumber}`);
  console.log("-".repeat(80));
  console.log(content);
  console.log("-".repeat(80));
  
  // Mark as read
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
