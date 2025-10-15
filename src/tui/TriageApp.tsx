import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { TableView } from "./TableView";
import { BulkTriageProgress, type BulkTriageStatus } from "./BulkTriageProgress";
import { TriageQueue, type TriageQueueEvent } from "./TriageQueue";
import type { IssueMetadata, ReviewManager } from "../review-manager";
import { Toast, type ToastMessage } from "./Toast";

interface TriageAppProps {
  owner: string;
  repo: string;
  projectPath: string;
  triagePath: string;
  debugPath: string;
  projectRoot: string;
  repoSlug: string;
  githubToken: string;
  options?: {
    state?: "open" | "closed" | "all";
    labels?: string[];
    limit?: number;
    sort?: "created" | "updated" | "comments";
    direction?: "asc" | "desc";
    concurrency?: number;
    force?: boolean;
  };
}

export const TriageApp: React.FC<TriageAppProps> = ({
  owner,
  repo,
  projectPath,
  triagePath,
  debugPath,
  projectRoot,
  repoSlug,
  githubToken,
  options = {},
}) => {
  const { exit } = useApp();
  const [issues, setIssues] = useState<IssueMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [bulkTriageStatus, setBulkTriageStatus] = useState<BulkTriageStatus | null>(null);
  const [perRowStatus, setPerRowStatus] = useState<Map<number, "idle" | "queued" | "running" | "done" | "skipped" | "error">>(new Map());
  const [paused, setPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const queueRef = useRef<TriageQueue | null>(null);
  const reviewManagerRef = useRef<ReviewManager | null>(null);

  // Auto-clear expired toasts
  useEffect(() => {
    if (!toast || !toast.expiresAt) return;

    const timeout = setTimeout(() => {
      setToast(null);
    }, toast.expiresAt - Date.now());

    return () => clearTimeout(timeout);
  }, [toast]);

  const refreshIssueMetadata = useCallback(async (issueNumber: number) => {
    const reviewManager = reviewManagerRef.current;
    if (!reviewManager) return;

    try {
      await reviewManager.scanForNewIssues();
      const updatedIssue = reviewManager.getCachedIssue(issueNumber);
      if (!updatedIssue) return;

      setIssues((prev) => {
        const idx = prev.findIndex((issue) => issue.issueNumber === issueNumber);
        if (idx === -1) {
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...updatedIssue };
        return next;
      });
    } catch (err) {
      console.error(`Failed to refresh metadata for issue #${issueNumber}`, err);
    }
  }, []);

  // Initialize and fetch issues
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);

        // Import dependencies
        const { GitHubClient } = await import("../github");
        const { ReviewManager } = await import("../review-manager");

        const client = new GitHubClient(githubToken);
        const reviewManager = new ReviewManager(projectRoot, repoSlug);
        reviewManagerRef.current = reviewManager;

        // Fetch issues from GitHub based on filters
        const issuesToTriage: IssueMetadata[] = [];

        for await (const issue of client.listIssuesPaginated(owner, repo, {
          state: options.state || "open",
          labels: options.labels,
          sort: options.sort || "created",
          direction: options.direction || "desc",
        })) {
          if (!issue.number) continue;

          // Check limit
          if (options.limit && issuesToTriage.length >= options.limit) {
            break;
          }

          // Check if already triaged (unless force mode)
          if (!options.force) {
            const resultPath = `${triagePath}/issue-${issue.number}-triage.md`;
            const resultFile = Bun.file(resultPath);
            if (await resultFile.exists()) {
              continue; // Skip already triaged
            }
          }

          issuesToTriage.push({
            issueNumber: issue.number,
            title: issue.title,
            triageDate: "",
            reviewStatus: "unread",
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
          });
        }

        if (issuesToTriage.length === 0) {
          setLoadError("No issues to triage. All issues may already be triaged (use --force to re-triage).");
          setIsLoading(false);
          return;
        }

        setIssues(issuesToTriage);
        setIsLoading(false);

        // Initialize TriageQueue
        const queue = new TriageQueue({
          owner,
          repo,
          projectPath,
          triagePath,
          debugPath,
          projectRoot,
          repoSlug,
          githubToken,
          concurrency: options.concurrency || 3,
          defaultAdapter: "claude",
        });

        // Wire queue events to UI state
        queue.on("event", (event: TriageQueueEvent) => {
          if (event.type === "queued") {
            setPerRowStatus((prev) => new Map(prev).set(event.issueNumber, "queued"));
            setBulkTriageStatus((prev) => {
              const newTotal = (prev?.total || 0) + 1;
              return prev
                ? { ...prev, total: newTotal }
                : { total: newTotal, completed: 0, failed: 0, skipped: 0, inFlight: 0, startTime: Date.now() };
            });
          } else if (event.type === "started") {
            setPerRowStatus((prev) => new Map(prev).set(event.issueNumber, "running"));
            setBulkTriageStatus((prev) => {
              if (!prev) return prev;
              const activeIssues = queueRef.current?.getActiveIssues() || [];
              return { ...prev, inFlight: prev.inFlight + 1, activeIssues };
            });
          } else if (event.type === "success") {
            setPerRowStatus((prev) => new Map(prev).set(event.issueNumber, "done"));
            setBulkTriageStatus((prev) => {
              if (!prev) return prev;
              const activeIssues = queueRef.current?.getActiveIssues() || [];
              return {
                ...prev,
                completed: prev.completed + 1,
                inFlight: Math.max(0, prev.inFlight - 1),
                activeIssues,
              };
            });
            refreshIssueMetadata(event.issueNumber);
          } else if (event.type === "error") {
            setPerRowStatus((prev) => new Map(prev).set(event.issueNumber, "error"));
            setBulkTriageStatus((prev) => {
              if (!prev) return prev;
              const activeIssues = queueRef.current?.getActiveIssues() || [];
              return {
                ...prev,
                failed: prev.failed + 1,
                inFlight: Math.max(0, prev.inFlight - 1),
                activeIssues,
              };
            });
          } else if (event.type === "drain") {
            // All done!
            setIsComplete(true);
          }
        });

        queueRef.current = queue;

        // Auto-start triaging
        const issueNumbers = issuesToTriage.map((i) => i.issueNumber);
        queue.enqueue(issueNumbers);

        setToast({
          message: `Starting triage of ${issueNumbers.length} issue(s) with concurrency ${options.concurrency || 3}`,
          level: "info",
          expiresAt: Date.now() + 3000,
        });
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to initialize triage");
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      queueRef.current?.stop();
      queueRef.current = null;
      reviewManagerRef.current = null;
    };
  }, [refreshIssueMetadata]);

  // Auto-exit when complete (after showing completion message)
  useEffect(() => {
    if (isComplete || isCancelled) {
      const timer = setTimeout(() => {
        exit();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, isCancelled, exit]);

  useInput((input, key) => {
    if (isLoading || loadError) {
      if (input === "q" || key.escape) {
        exit();
      }
      return;
    }

    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(issues.length - 1, prev + 1));
    } else if (input === "p" || input === "P") {
      // Pause/Resume (not implemented yet in TriageQueue, but we can track state)
      setPaused((prev) => !prev);
      setToast({
        message: paused ? "Resuming..." : "Pausing... (active tasks will complete)",
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (key.escape) {
      // Cancel
      queueRef.current?.stop();
      setIsCancelled(true);
      setToast({
        message: "Cancelling... (active tasks will complete)",
        level: "warn",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "q") {
      // Quit (stop queue and exit)
      queueRef.current?.stop();
      exit();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">🔍 Loading issues to triage...</Text>
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Error: {loadError}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Q or ESC to exit</Text>
        </Box>
      </Box>
    );
  }

  if (isComplete) {
    const status = bulkTriageStatus;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">✅ Triage Complete!</Text>
        {status && (
          <Box marginTop={1}>
            <Text>
              <Text color="green">✓ {status.completed}</Text>
              <Text> | </Text>
              <Text color="red">✗ {status.failed}</Text>
              <Text> | </Text>
              <Text>Total: {status.total}</Text>
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Exiting...</Text>
        </Box>
      </Box>
    );
  }

  if (isCancelled) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⚠️  Triage Cancelled</Text>
        <Box marginTop={1}>
          <Text dimColor>Exiting...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {toast && <Toast toast={toast} />}

      <Box marginBottom={1}>
        <Text bold color="cyan">
          Triaging {owner}/{repo}
        </Text>
        <Text dimColor> | </Text>
        <Text dimColor>
          Concurrency: {options.concurrency || 3} | Press Q to quit, ESC to cancel, P to pause
        </Text>
      </Box>

      <TableView
        issues={issues}
        selectedIndex={selectedIndex}
        visibleRows={20}
        perRowStatus={perRowStatus}
      />

      {bulkTriageStatus && (
        <BulkTriageProgress status={bulkTriageStatus} />
      )}

      {paused && (
        <Box marginTop={1} borderStyle="single" paddingX={1}>
          <Text color="yellow">⏸  Paused (press P to resume)</Text>
        </Box>
      )}
    </Box>
  );
};
