#!/usr/bin/env bun

import path from "node:path";
import { Command } from "commander";
import { GitHubClient } from "./github";
import { IssueTriage } from "./issue-triager";

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
