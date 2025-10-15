import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { TableView } from "./TableView";
import { StatusBar } from "./StatusBar";
import { ReviewManager, type IssueMetadata } from "../review-manager";
import { EditorManager } from "../editor-manager";
import { BulkTriageProgress, type BulkTriageStatus } from "./BulkTriageProgress";
import { TriageQueue, type TriageQueueEvent } from "./TriageQueue";
import { AdapterPicker } from "./AdapterPicker";
import { Toast, type ToastMessage } from "./Toast";

interface InboxAppProps {
  filter?: "all" | "read" | "unread";
  sort?: "number" | "date";
  closeFilter?: "yes" | "no" | "unknown" | "not-no";
}

export const InboxApp: React.FC<InboxAppProps> = ({
  filter = "all",
  sort = "number",
  closeFilter,
}) => {
  const { exit } = useApp();
  const [allIssues, setAllIssues] = useState<IssueMetadata[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<IssueMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stats, setStats] = useState({ total: 0, read: 0, unread: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [editorManager] = useState(() => new EditorManager());
  const [showEditorSelect, setShowEditorSelect] = useState(false);
  const [filterMode, setFilterMode] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "read" | "unread">("all");
  const [closeRecommendFilter, setCloseRecommendFilter] = useState<"all" | "close" | "keep">("all");
  const [githubClosedFilter, setGithubClosedFilter] = useState<"all" | "open" | "closed">("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [jumpMode, setJumpMode] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [lastGPress, setLastGPress] = useState<number>(0);
  const [currentProject, setCurrentProject] = useState<string>("");
  const [projectRoot, setProjectRoot] = useState<string>("results");
  const [showProjectSelect, setShowProjectSelect] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<Array<{id: string, owner: string, repo: string}>>([]);

  // Sorting state
  const [sortField, setSortField] = useState<"number" | "triage-date" | "created" | "activity">("number");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Preset state
  const [activePreset, setActivePreset] = useState<number | null>(null);
  
  // Visual selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  
  // Background triage queue
  const queueRef = useRef<TriageQueue | null>(null);
  const [showAdapterPicker, setShowAdapterPicker] = useState(false);
  const [lastAdapter, setLastAdapter] = useState<"claude" | "codex">("claude");
  const [bulkTriageStatus, setBulkTriageStatus] = useState<BulkTriageStatus | null>(null);
  const [perRowStatus, setPerRowStatus] = useState<Map<number, "idle" | "queued" | "running" | "done" | "skipped" | "error">>(new Map());
  
  // GitHub sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const isSyncingRef = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [allIssues, filterText, statusFilter, closeRecommendFilter, githubClosedFilter, modelFilter, sortDirection]);

  // Reload issues when sort changes
  useEffect(() => {
    if (currentProject) {
      loadIssues();
    }
  }, [sortField]);

  // Initialize triage queue when project context is available
  useEffect(() => {
    if (!currentProject || !projectRoot) return;

    const initQueue = async () => {
      try {
        const { ProjectContext } = await import("../project-context");
        const ctx = await ProjectContext.resolve({});
        
        // Ensure we have a codePath - this is critical for codebase access
        if (!ctx.codePath || ctx.codePath === process.cwd()) {
          console.warn("Warning: No codePath configured for project, triage may not have codebase access");
        }
        
        const queue = new TriageQueue({
          owner: ctx.owner,
          repo: ctx.repo,
          projectPath: ctx.codePath,
          triagePath: ctx.paths.triage,
          debugPath: ctx.paths.debug,
          projectRoot: ctx.paths.root,
          repoSlug: ctx.repoSlug,
          githubToken: ctx.token,
          concurrency: 3,
          defaultAdapter: lastAdapter,
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
            // Reload issues to get updated metadata
            loadIssues();
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
            setToast({
              message: `Failed to triage issue #${event.issueNumber}: ${event.error}`,
              level: "error",
              expiresAt: Date.now() + 5000,
            });
          } else if (event.type === "drain") {
            // Queue is empty
            setBulkTriageStatus(null);
            setPerRowStatus(new Map());
            setToast({
              message: "All issues triaged!",
              level: "success",
              expiresAt: Date.now() + 3000,
            });
          }
        });

        queueRef.current = queue;
      } catch (err) {
        console.error("Failed to initialize queue:", err);
      }
    };

    initQueue();

    return () => {
      queueRef.current?.stop();
      queueRef.current = null;
    };
  }, [currentProject, projectRoot]);

  // Auto-clear expired toasts
  useEffect(() => {
    if (!toast || !toast.expiresAt) return;

    const timeout = setTimeout(() => {
      setToast(null);
    }, toast.expiresAt - Date.now());

    return () => clearTimeout(timeout);
  }, [toast]);

  const loadIssues = async () => {
    try {
      const { ProjectContext } = await import("../project-context");
      const { ConfigManager } = await import("../config-manager");
      
      const ctx = await ProjectContext.resolve({});
      await ctx.ensureDirs();
      await ctx.migrateLegacyIfNeeded();
      
      setCurrentProject(ctx.repoSlug);
      setProjectRoot(ctx.paths.root);
      
      const configManager = new ConfigManager();
      const projects = configManager.listProjects();
      setAvailableProjects(projects);
      
      const reviewManager = new ReviewManager(ctx.paths.root, ctx.repoSlug);
      
      await reviewManager.scanForNewIssues();
      
      const issuesList = await reviewManager.getInbox(filter, sortField, closeFilter);
      const statsData = await reviewManager.getStats();
      setAllIssues(issuesList);
      setStats(statsData);
      setFatalError(null);
      
      reviewManager.fetchMissingTitlesInBackground(async () => {
        await reviewManager.loadMetadata();
        const updatedIssues = await reviewManager.getInbox(filter, sortField, closeFilter);
        setAllIssues(updatedIssues);
      }).catch((err) => {
        console.error("Failed to fetch titles:", err);
      });
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : "Failed to load issues");
    }
  };

  const handleFilterTextChange = (text: string) => {
    setFilterText(text);
    if (text !== "") {
      setActivePreset(null);
    }
  };

  const applyFilter = () => {
    let filtered = [...allIssues];

    // Apply text search filter
    if (filterText.trim()) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter((issue) => {
        const matchesNumber = issue.issueNumber.toString().includes(searchLower);
        const matchesTitle = issue.title?.toLowerCase().includes(searchLower);
        const matchesLabels = issue.labels?.some((label) =>
          label.toLowerCase().includes(searchLower)
        );
        return matchesNumber || matchesTitle || matchesLabels;
      });
    }

    // Apply status filter
    if (statusFilter === "read") {
      filtered = filtered.filter((i) => i.reviewStatus === "read");
    } else if (statusFilter === "unread") {
      filtered = filtered.filter((i) => i.reviewStatus === "unread");
    }

    // Apply close recommendation filter
    if (closeRecommendFilter === "close") {
      filtered = filtered.filter((i) => i.shouldClose === true);
    } else if (closeRecommendFilter === "keep") {
      filtered = filtered.filter((i) => i.shouldClose === false);
    }

    // Apply GitHub closed filter
    if (githubClosedFilter === "open") {
      filtered = filtered.filter((i) => !i.closedOnGitHub);
    } else if (githubClosedFilter === "closed") {
      filtered = filtered.filter((i) => i.closedOnGitHub === true);
    }

    // Apply model filter
    if (modelFilter !== "all") {
      filtered = filtered.filter((i) => i.model === modelFilter);
    }

    // Apply sort direction (reverse if ascending)
    if (sortDirection === "asc") {
      filtered = filtered.reverse();
    }

    setFilteredIssues(filtered);
    setSelectedIndex(0);
  };

  const markAsRead = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const reviewManager = new ReviewManager(projectRoot, currentProject);
    await reviewManager.loadMetadata();
    await reviewManager.markAsRead(issue.issueNumber);
    await loadIssues();
  };

  const markAsUnread = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const reviewManager = new ReviewManager(projectRoot, currentProject);
    await reviewManager.loadMetadata();
    await reviewManager.markAsUnread(issue.issueNumber);
    await loadIssues();
  };

  const openInBrowser = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    let repoSlug: string | undefined = currentProject || undefined;

    try {
      const { ConfigManager } = await import("../config-manager");
      const configManager = new ConfigManager();
      if (!repoSlug) {
        repoSlug = configManager.getGitHubRepo() || configManager.getActiveProject();
      }
    } catch (err) {
      console.error("Failed to load config manager:", err);
    }

    if (!repoSlug) {
      try {
        const { ProjectContext } = await import("../project-context");
        const ctx = await ProjectContext.resolve({});
        repoSlug = ctx.repoSlug;
      } catch (err) {
        console.error("Failed to resolve project context for browser open:", err);
      }
    }

    if (!repoSlug) {
      setToast({
        message: "No GitHub repo configured. Run: bun run src/cli.ts config set-repo owner/repo",
        level: "error",
        expiresAt: Date.now() + 5000,
      });
      return;
    }

    try {
      Bun.spawnSync([
        "gh", "issue", "view",
        issue.issueNumber.toString(),
        "--web",
        "-R", repoSlug
      ]);
    } catch (err) {
      setToast({
        message: "Failed to open in browser. Is gh cli installed?",
        level: "error",
        expiresAt: Date.now() + 5000,
      });
    }
  };

  const openInEditor = async (editorKey?: string) => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    // Check if issue has been triaged
    if (!issue.triageDate) {
      setToast({
        message: `Issue #${issue.issueNumber} hasn't been triaged yet. Press 'V' then 'T' to triage it.`,
        level: "warn",
        expiresAt: Date.now() + 5000,
      });
      return;
    }

    try {
      const { ProjectContext } = await import("../project-context");
      const ctx = await ProjectContext.resolve({});
      const filePath = `${ctx.paths.triage}/issue-${issue.issueNumber}-triage.md`;
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        setToast({
          message: `Triage file not found: ${filePath}`,
          level: "error",
          expiresAt: Date.now() + 5000,
        });
        return;
      }

      await editorManager.openFile(filePath, editorKey);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to open editor",
        level: "error",
        expiresAt: Date.now() + 5000,
      });
    }
  };

  const jumpToIssue = (issueNumber: number) => {
    const index = filteredIssues.findIndex((issue) => issue.issueNumber === issueNumber);
    if (index !== -1) {
      setSelectedIndex(index);
      setJumpMode(false);
      setJumpInput("");
    } else {
      setToast({
        message: `Issue #${issueNumber} not found in current view`,
        level: "warn",
        expiresAt: Date.now() + 4000,
      });
      setJumpMode(false);
      setJumpInput("");
    }
  };

  const switchProject = async (projectId: string) => {
    try {
      const { ConfigManager } = await import("../config-manager");
      const configManager = new ConfigManager();
      await configManager.setActiveProject(projectId);
      setShowProjectSelect(false);
      await loadIssues();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to switch project",
        level: "error",
        expiresAt: Date.now() + 5000,
      });
      setShowProjectSelect(false);
    }
  };

  const startSync = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (isSyncingRef.current) {
      if (!opts?.silent) {
        setToast({
          message: "Sync already in progress",
          level: "info",
          expiresAt: Date.now() + 2000,
        });
      }
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const { ProjectContext } = await import("../project-context");
      const { syncClosedIssues } = await import("../sync-service");
      const ctx = await ProjectContext.resolve({});
      
      const result = await syncClosedIssues(ctx);
      setLastSyncAt(Date.now());
      
      if (!opts?.silent) {
        setToast({
          message: `Synced ${result.updated} closed issue${result.updated !== 1 ? "s" : ""}`,
          level: "success",
          expiresAt: Date.now() + 3000,
        });
      }
      
      await loadIssues();
    } catch (err) {
      if (!opts?.silent) {
        setToast({
          message: `Sync failed: ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
          expiresAt: Date.now() + 4000,
        });
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  const enqueueForTriage = (adapter: "claude" | "codex") => {
    if (!queueRef.current) {
      setToast({
        message: "Triage queue not initialized",
        level: "error",
        expiresAt: Date.now() + 5000,
      });
      return;
    }

    if (selectedIssues.size === 0) {
      setToast({
        message: "No issues selected",
        level: "warn",
        expiresAt: Date.now() + 3000,
      });
      return;
    }

    queueRef.current.setAdapter(adapter);
    queueRef.current.enqueue(Array.from(selectedIssues));
    setLastAdapter(adapter);
    
    setToast({
      message: `Enqueued ${selectedIssues.size} issue(s) for triage with ${adapter}`,
      level: "success",
      expiresAt: Date.now() + 3000,
    });

    // Clear selection after enqueuing
    setSelectedIssues(new Set());
    setSelectionMode(false);
  };

  // Filter presets
  const applyPreset = (presetNumber: number) => {
    const presets: Record<number, {
      name: string;
      statusFilter: "all" | "read" | "unread";
      closeRecommendFilter: "all" | "close" | "keep";
      githubClosedFilter: "all" | "open" | "closed";
      modelFilter: string;
      sortField: "number" | "triage-date" | "created" | "activity";
      sortDirection: "asc" | "desc";
      filterText: string;
    }> = {
      1: {
        name: "Inbox",
        statusFilter: "unread",
        closeRecommendFilter: "all",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "activity",
        sortDirection: "desc",
        filterText: "",
      },
      2: {
        name: "To Close",
        statusFilter: "all",
        closeRecommendFilter: "close",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "triage-date",
        sortDirection: "desc",
        filterText: "",
      },
      3: {
        name: "To Keep",
        statusFilter: "all",
        closeRecommendFilter: "keep",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "activity",
        sortDirection: "desc",
        filterText: "",
      },
      4: {
        name: "Recently Triaged",
        statusFilter: "all",
        closeRecommendFilter: "all",
        githubClosedFilter: "all",
        modelFilter: "all",
        sortField: "triage-date",
        sortDirection: "desc",
        filterText: "",
      },
      5: {
        name: "Needs Review",
        statusFilter: "unread",
        closeRecommendFilter: "keep",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "created",
        sortDirection: "asc",
        filterText: "",
      },
      6: {
        name: "Closed on GitHub",
        statusFilter: "all",
        closeRecommendFilter: "all",
        githubClosedFilter: "closed",
        modelFilter: "all",
        sortField: "activity",
        sortDirection: "desc",
        filterText: "",
      },
      7: {
        name: "Oldest First",
        statusFilter: "all",
        closeRecommendFilter: "all",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "created",
        sortDirection: "asc",
        filterText: "",
      },
      8: {
        name: "Hot Issues",
        statusFilter: "all",
        closeRecommendFilter: "all",
        githubClosedFilter: "open",
        modelFilter: "all",
        sortField: "activity",
        sortDirection: "desc",
        filterText: "",
      },
      9: {
        name: "Clear All",
        statusFilter: "all",
        closeRecommendFilter: "all",
        githubClosedFilter: "all",
        modelFilter: "all",
        sortField: "number",
        sortDirection: "desc",
        filterText: "",
      },
    };

    const preset = presets[presetNumber];
    if (!preset) return;

    setStatusFilter(preset.statusFilter);
    setCloseRecommendFilter(preset.closeRecommendFilter);
    setGithubClosedFilter(preset.githubClosedFilter);
    setModelFilter(preset.modelFilter);
    setSortField(preset.sortField);
    setSortDirection(preset.sortDirection);
    setFilterText(preset.filterText);
    setActivePreset(presetNumber);

    setToast({
      message: `Preset ${presetNumber}: ${preset.name}`,
      level: "info",
      expiresAt: Date.now() + 2000,
    });
  };

  // Auto-sync timer
  useEffect(() => {
    if (!currentProject || !projectRoot) return;

    const setupAutoSync = async () => {
      try {
        const syncIntervalMinutes = Number(process.env.GITHUB_TRIAGE_SYNC_MINUTES) || 10;
        const intervalMs = Math.max(1, syncIntervalMinutes) * 60 * 1000;

        if (syncTimerRef.current) {
          clearInterval(syncTimerRef.current);
        }

        syncTimerRef.current = setInterval(() => {
          startSync({ silent: true });
        }, intervalMs);
      } catch (err) {
        console.error("Failed to setup auto-sync:", err);
      }
    };

    setupAutoSync();

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [currentProject, projectRoot, startSync]);

  useInput(async (input, key) => {
    if (filterMode || jumpMode) {
      return;
    }

    if (showHelp) {
      setShowHelp(false);
      return;
    }

    if (showAdapterPicker) {
      if (input === "1") {
        enqueueForTriage("claude");
        setShowAdapterPicker(false);
      } else if (input === "2") {
        enqueueForTriage("codex");
        setShowAdapterPicker(false);
      } else if (key.return && lastAdapter) {
        enqueueForTriage(lastAdapter);
        setShowAdapterPicker(false);
      } else if (key.escape || input === "q") {
        setShowAdapterPicker(false);
      }
      return;
    }

    if (showProjectSelect) {
      const num = parseInt(input);
      if (num >= 1 && num <= availableProjects.length) {
        const project = availableProjects[num - 1];
        if (project) {
          await switchProject(project.id);
        }
      } else if (key.escape || input === "q") {
        setShowProjectSelect(false);
      }
      return;
    }

    if (showEditorSelect) {
      const editors = editorManager.getAvailableEditors();
      const num = parseInt(input);
      if (num >= 1 && num <= editors.length) {
        openInEditor(editors[num - 1]?.key);
        setShowEditorSelect(false);
      } else if (key.escape || input === "q") {
        setShowEditorSelect(false);
      }
      return;
    }

    // Vim navigation: j/k and arrow keys
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(filteredIssues.length - 1, prev + 1));
    } else if (input === "G") {
      // Shift+G: Jump to bottom
      setSelectedIndex(Math.max(0, filteredIssues.length - 1));
    } else if (input === "g") {
      // Check for "gg" (double g within 500ms)
      const now = Date.now();
      if (now - lastGPress < 500) {
        // Jump to top
        setSelectedIndex(0);
        setLastGPress(0);
      } else {
        // Record first g press
        setLastGPress(now);
      }
    } else if (key.return) {
      openInEditor();
    } else if (input === "r") {
      markAsRead();
    } else if (input === "u") {
      markAsUnread();
    } else if (input === "e") {
      const editors = editorManager.getAvailableEditors();
      if (editors.length === 0) {
        setToast({
          message: "No editors available",
          level: "error",
          expiresAt: Date.now() + 3000,
        });
      } else if (editors.length === 1) {
        openInEditor(editors[0]?.key);
      } else {
        setShowEditorSelect(true);
      }
    } else if (input === "/") {
      setFilterMode(true);
    } else if (input === ":") {
      setJumpMode(true);
      setJumpInput("");
    } else if (input >= "1" && input <= "9") {
      // Apply preset
      applyPreset(parseInt(input));
    } else if (input === "r") {
      // Toggle status filter: all -> unread -> read -> all
      const nextStatus = statusFilter === "all" ? "unread" : statusFilter === "unread" ? "read" : "all";
      setStatusFilter(nextStatus);
      setActivePreset(null);
      const statusLabels = { all: "All", unread: "Unread", read: "Read" };
      setToast({
        message: `Status: ${statusLabels[nextStatus]}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "c") {
      // Filter: Toggle GitHub closed/open
      const nextFilter = githubClosedFilter === "all" ? "open" : githubClosedFilter === "open" ? "closed" : "all";
      setGithubClosedFilter(nextFilter);
      setActivePreset(null);
      const filterLabels = { all: "All", open: "Open on GitHub", closed: "Closed on GitHub" };
      setToast({
        message: `GitHub filter: ${filterLabels[nextFilter]}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "x") {
      // Filter: Cycle close recommendation (all → close → keep → all)
      const cycle: Array<"all" | "close" | "keep"> = ["all", "close", "keep"];
      const currentIndex = cycle.indexOf(closeRecommendFilter);
      const nextIndex = (currentIndex + 1) % cycle.length;
      const nextFilter = cycle[nextIndex]!;
      setCloseRecommendFilter(nextFilter);
      setActivePreset(null);

      const filterLabels = { all: "All", close: "Should Close", keep: "Should Keep" };
      setToast({
        message: `Close recommendation: ${filterLabels[nextFilter]}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "m") {
      // Filter: Cycle through models
      const uniqueModels = ["all", ...new Set(allIssues.map((i) => i.model).filter(Boolean) as string[])].sort();
      const currentIndex = uniqueModels.indexOf(modelFilter);
      const nextIndex = (currentIndex + 1) % uniqueModels.length;
      const nextModel = uniqueModels[nextIndex]!;
      setModelFilter(nextModel);
      setActivePreset(null);
      setToast({
        message: `Model filter: ${nextModel === "all" ? "All" : nextModel}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "w" || input === "W") {
      await openInBrowser();
    } else if (input === "p" || input === "P") {
      if (availableProjects.length > 1) {
        setShowProjectSelect(true);
      } else if (availableProjects.length === 0) {
        setToast({
          message: "No projects configured. Run: bun cli.ts project add -o owner -r repo -t token",
          level: "warn",
          expiresAt: Date.now() + 5000,
        });
      } else {
        setToast({
          message: "Only one project configured",
          level: "info",
          expiresAt: Date.now() + 3000,
        });
      }
    } else if (input === "v") {
      // Toggle visual selection mode
      setSelectionMode((prev) => !prev);
      if (selectionMode) {
        // Exiting selection mode - clear selection
        setSelectedIssues(new Set());
      }
    } else if (input === " " && selectionMode) {
      // Toggle selection for current issue
      if (filteredIssues.length === 0) return;
      const issue = filteredIssues[selectedIndex];
      if (!issue) return;
      
      setSelectedIssues((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(issue.issueNumber)) {
          newSet.delete(issue.issueNumber);
        } else {
          newSet.add(issue.issueNumber);
        }
        return newSet;
      });
    } else if (input === "a" && selectionMode) {
      // Select all in current filtered view
      const allNumbers = new Set(filteredIssues.map((i) => i.issueNumber));
      setSelectedIssues(allNumbers);
    } else if (input === "i" && selectionMode) {
      // Invert selection in current filtered view
      setSelectedIssues((prev) => {
        const newSet = new Set<number>();
        for (const issue of filteredIssues) {
          if (!prev.has(issue.issueNumber)) {
            newSet.add(issue.issueNumber);
          }
        }
        return newSet;
      });
    } else if (input === "t" && selectionMode && selectedIssues.size > 0) {
      // Open adapter picker
      setShowAdapterPicker(true);
    } else if (input === "T" && selectionMode && selectedIssues.size > 0) {
      // Quick re-triage with last adapter
      enqueueForTriage(lastAdapter);
    } else if (input === "s" || input === "S") {
      startSync();
    } else if (input === "o") {
      // Cycle through sort options
      const sortOptions: Array<"number" | "triage-date" | "created" | "activity"> = ["number", "triage-date", "created", "activity"];
      const currentIndex = sortOptions.indexOf(sortField);
      const nextIndex = (currentIndex + 1) % sortOptions.length;
      setSortField(sortOptions[nextIndex]!);
      setActivePreset(null);

      const sortNames = {
        "number": "Issue #",
        "triage-date": "Last Triaged",
        "created": "Created Date",
        "activity": "Last Activity"
      };

      setToast({
        message: `Sort: ${sortNames[sortOptions[nextIndex]!]}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (input === "O") {
      // Reverse sort direction
      setSortDirection((prev) => prev === "asc" ? "desc" : "asc");
      setActivePreset(null);
      setToast({
        message: `Sort direction: ${sortDirection === "asc" ? "Descending" : "Ascending"}`,
        level: "info",
        expiresAt: Date.now() + 2000,
      });
    } else if (key.escape) {
      if (selectionMode) {
        // First ESC clears selection, second ESC exits selection mode
        if (selectedIssues.size > 0) {
          setSelectedIssues(new Set());
        } else {
          setSelectionMode(false);
        }
      } else {
        setFilterText("");
        setFilterMode(false);
        setJumpMode(false);
        setJumpInput("");
        setStatusFilter("all");
        setCloseRecommendFilter("all");
        setGithubClosedFilter("all");
        setModelFilter("all");
        setActivePreset(null);
      }
    } else if (input === "?") {
      setShowHelp(true);
    } else if (input === "q") {
      exit();
    }
  });

  if (fatalError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Fatal Error: {fatalError}</Text>
        <Text dimColor>Press Q to quit</Text>
      </Box>
    );
  }

  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Interactive Inbox Help
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Navigation:</Text>
          <Text>  <Text color="green">↑/↓</Text> or <Text color="green">k/j</Text> - Navigate through issues</Text>
          <Text>  <Text color="green">gg</Text> - Jump to top | <Text color="green">G</Text> - Jump to bottom</Text>
          <Text>  <Text color="green">:</Text> - Jump to issue number</Text>
          <Text>  <Text color="green">Enter</Text> - Open issue in default editor</Text>
          <Text>  <Text color="green">E</Text> - Choose editor and open</Text>
          <Text>  <Text color="green">W</Text> - Open issue in web browser</Text>

          <Box marginTop={1}>
            <Text bold>Status:</Text>
          </Box>
          <Text>  <Text color="green">R</Text> - Mark as read</Text>
          <Text>  <Text color="green">U</Text> - Mark as unread</Text>

          <Box marginTop={1}>
            <Text bold>Filter Presets:</Text>
          </Box>
          <Text>  <Text color="green">1</Text> - Inbox (unread, open)</Text>
          <Text>  <Text color="green">2</Text> - To Close (recommended closures)</Text>
          <Text>  <Text color="green">3</Text> - To Keep (recommended keepers)</Text>
          <Text>  <Text color="green">4</Text> - Recently Triaged</Text>
          <Text>  <Text color="green">5</Text> - Needs Review (unread keepers)</Text>
          <Text>  <Text color="green">6</Text> - Closed on GitHub</Text>
          <Text>  <Text color="green">7</Text> - Oldest First (stale issues)</Text>
          <Text>  <Text color="green">8</Text> - Hot Issues (recent activity)</Text>
          <Text>  <Text color="green">9</Text> - Clear All (reset)</Text>

          <Box marginTop={1}>
            <Text bold>Manual Filters:</Text>
          </Box>
          <Text>  <Text color="green">/</Text> - Search by text</Text>
          <Text>  <Text color="green">r</Text> - Cycle status (all/unread/read)</Text>
          <Text>  <Text color="green">c</Text> - Cycle GitHub status (all/open/closed)</Text>
          <Text>  <Text color="green">x</Text> - Cycle close recommendation (all/close/keep)</Text>
          <Text>  <Text color="green">m</Text> - Cycle model filter (all/claude/codex/sonnet-4-5/etc)</Text>
          <Text>  <Text color="green">ESC</Text> - Clear all filters</Text>

          <Box marginTop={1}>
            <Text bold>Selection Mode:</Text>
          </Box>
          <Text>  <Text color="green">V</Text> - Enter/exit visual selection mode</Text>
          <Text>  <Text color="green">Space</Text> - Toggle selection (in selection mode)</Text>
          <Text>  <Text color="green">A</Text> - Select all (in selection mode)</Text>
          <Text>  <Text color="green">I</Text> - Invert selection (in selection mode)</Text>
          <Text>  <Text color="green">T</Text> - Bulk triage (with parameters)</Text>
          <Text>  <Text color="green">Shift+T</Text> - Quick bulk triage (last params)</Text>
          <Text>  <Text color="green">ESC</Text> - Clear selection (in selection mode)</Text>

          <Box marginTop={1}>
            <Text bold>Sorting:</Text>
          </Box>
          <Text>  <Text color="green">O</Text> - Cycle sort field (Issue #, Last Triaged, Created, Activity)</Text>
          <Text>  <Text color="green">Shift+O</Text> - Reverse sort direction (asc/desc)</Text>

          <Box marginTop={1}>
            <Text bold>Other:</Text>
          </Box>
          <Text>  <Text color="green">S</Text> - Sync with GitHub (auto-syncs every 10min)</Text>
          <Text>  <Text color="green">P</Text> - Switch project</Text>
          <Text>  <Text color="green">?</Text> - Show this help</Text>
          <Text>  <Text color="green">Q</Text> - Quit</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press any key to continue...</Text>
        </Box>
      </Box>
    );
  }

  if (showProjectSelect) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Switch Project
        </Text>
        <Box marginTop={1} flexDirection="column">
          {availableProjects.map((project, idx) => {
            const isActive = project.id === currentProject;
            return (
              <Text key={project.id}>
                <Text color="green">{idx + 1}</Text> - {project.id}
                {isActive && <Text color="magenta" bold> (current)</Text>}
              </Text>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press number to select, ESC or Q to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (showEditorSelect) {
    const editors = editorManager.getAvailableEditors();
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Select Editor
        </Text>
        <Box marginTop={1} flexDirection="column">
          {editors.map((editor, idx) => (
            <Text key={editor.key}>
              <Text color="green">{idx + 1}</Text> - {editor.name}
              <Text dimColor> ({editor.path})</Text>
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press number to select, ESC or Q to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {toast && <Toast toast={toast} />}

      {showAdapterPicker && (
        <AdapterPicker
          onSelect={enqueueForTriage}
          onCancel={() => setShowAdapterPicker(false)}
          lastAdapter={lastAdapter}
        />
      )}

      {filterMode && (
        <Box borderStyle="single" paddingX={1} marginBottom={1}>
          <Text>Filter: </Text>
          <TextInput
            value={filterText}
            onChange={handleFilterTextChange}
            onSubmit={() => setFilterMode(false)}
          />
          <Text dimColor> (Enter to finish, ESC to cancel)</Text>
        </Box>
      )}

      {jumpMode && (
        <Box borderStyle="single" paddingX={1} marginBottom={1}>
          <Text>Jump to issue #</Text>
          <TextInput
            value={jumpInput}
            onChange={setJumpInput}
            onSubmit={() => {
              const issueNum = parseInt(jumpInput);
              if (!isNaN(issueNum)) {
                jumpToIssue(issueNum);
              } else {
                setJumpMode(false);
                setJumpInput("");
              }
            }}
          />
          <Text dimColor> (Enter to jump, ESC to cancel)</Text>
        </Box>
      )}

      <TableView
        issues={filteredIssues}
        selectedIndex={selectedIndex}
        visibleRows={25}
        selectionMode={selectionMode}
        selectedIssues={selectedIssues}
        perRowStatus={perRowStatus}
      />

      {bulkTriageStatus && (
        <BulkTriageProgress status={bulkTriageStatus} />
      )}

      <StatusBar
        total={stats.total}
        unread={stats.unread}
        read={stats.read}
        filter={
          [
            filterText && `search:"${filterText}"`,
            statusFilter !== "all" && `status:${statusFilter.replace("-", " ")}`,
            closeRecommendFilter !== "all" && `recommend:${closeRecommendFilter}`,
            githubClosedFilter !== "all" && `github:${githubClosedFilter}`,
            modelFilter !== "all" && `model:${modelFilter}`,
          ]
            .filter(Boolean)
            .join(" ") || filter
        }
        currentProject={currentProject}
        selectionMode={selectionMode}
        selectedCount={selectedIssues.size}
        syncing={isSyncing}
        lastSyncAt={lastSyncAt}
        sortField={sortField}
        sortDirection={sortDirection}
        activePreset={activePreset}
      />
    </Box>
  );
};
