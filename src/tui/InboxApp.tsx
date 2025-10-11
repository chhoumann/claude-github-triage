import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { TableView } from "./TableView";
import { StatusBar } from "./StatusBar";
import { ReviewManager, type IssueMetadata } from "../review-manager";
import { EditorManager } from "../editor-manager";

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
  const [error, setError] = useState<string | null>(null);
  const [editorManager] = useState(() => new EditorManager());
  const [showEditorSelect, setShowEditorSelect] = useState(false);
  const [filterMode, setFilterMode] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "read" | "unread" | "done" | "unread-not-done">("all");
  const [closeRecommendFilter, setCloseRecommendFilter] = useState<"all" | "close" | "keep">("all");
  const [jumpMode, setJumpMode] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [lastGPress, setLastGPress] = useState<number>(0);

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [allIssues, filterText, statusFilter, closeRecommendFilter]);

  const loadIssues = async () => {
    try {
      const reviewManager = new ReviewManager();
      
      // Quick scan - don't fetch from GitHub yet
      await reviewManager.scanForNewIssues();
      
      // Load UI immediately with cached data
      const issuesList = await reviewManager.getInbox(filter, sort, closeFilter);
      const statsData = await reviewManager.getStats();
      setAllIssues(issuesList);
      setStats(statsData);
      setError(null);
      
      // Fetch missing titles in background and update as they come in
      reviewManager.fetchMissingTitlesInBackground(async () => {
        // Reload from disk to get updated titles
        await reviewManager.loadMetadata();
        const updatedIssues = await reviewManager.getInbox(filter, sort, closeFilter);
        setAllIssues(updatedIssues);
      }).catch((err) => {
        console.error("Failed to fetch titles:", err);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
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
    } else if (statusFilter === "done") {
      filtered = filtered.filter((i) => i.isDone === true);
    } else if (statusFilter === "unread-not-done") {
      filtered = filtered.filter((i) => i.reviewStatus === "unread" && i.isDone !== true);
    }

    // Apply close recommendation filter
    if (closeRecommendFilter === "close") {
      filtered = filtered.filter((i) => i.shouldClose === true);
    } else if (closeRecommendFilter === "keep") {
      filtered = filtered.filter((i) => i.shouldClose === false);
    }

    setFilteredIssues(filtered);
    setSelectedIndex(0);
  };

  const markAsRead = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const reviewManager = new ReviewManager();
    await reviewManager.loadMetadata();
    await reviewManager.markAsRead(issue.issueNumber);
    await loadIssues();
  };

  const markAsUnread = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const reviewManager = new ReviewManager();
    await reviewManager.loadMetadata();
    await reviewManager.markAsUnread(issue.issueNumber);
    await loadIssues();
  };

  const markAsDone = async (done: boolean = true) => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const reviewManager = new ReviewManager();
    await reviewManager.loadMetadata();
    await reviewManager.markAsDone(issue.issueNumber, done);
    await loadIssues();
  };

  const openInBrowser = async () => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    const { ConfigManager } = await import("../config-manager");
    const configManager = new ConfigManager();
    const repo = configManager.getGitHubRepo();

    if (!repo) {
      setError("No GitHub repo configured. Run: bun run src/cli.ts config set-repo owner/repo");
      return;
    }

    try {
      Bun.spawnSync([
        "gh", "issue", "view",
        issue.issueNumber.toString(),
        "--web",
        "-R", repo
      ]);
    } catch (err) {
      setError("Failed to open in browser. Is gh cli installed?");
    }
  };

  const openInEditor = async (editorKey?: string) => {
    if (filteredIssues.length === 0) return;
    const issue = filteredIssues[selectedIndex];
    if (!issue) return;

    try {
      const filePath = `results/issue-${issue.issueNumber}-triage.md`;
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        setError(`Triage file not found: ${filePath}`);
        return;
      }

      const absolutePath = `${process.cwd()}/${filePath}`;
      await editorManager.openFile(absolutePath, editorKey);

      // Stay in TUI - user can press Q to quit
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open editor");
    }
  };

  const jumpToIssue = (issueNumber: number) => {
    const index = filteredIssues.findIndex((issue) => issue.issueNumber === issueNumber);
    if (index !== -1) {
      setSelectedIndex(index);
      setJumpMode(false);
      setJumpInput("");
    } else {
      setError(`Issue #${issueNumber} not found in current view`);
      setJumpMode(false);
      setJumpInput("");
    }
  };

  useInput(async (input, key) => {
    // Skip input handling in filter/jump mode - TextInput handles it
    if (filterMode || jumpMode) {
      return;
    }

    if (showHelp) {
      setShowHelp(false);
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
    } else if (input === "d") {
      markAsDone(true);
    } else if (input === "D") {
      markAsDone(false); // Unmark as done
    } else if (input === "e") {
      const editors = editorManager.getAvailableEditors();
      if (editors.length === 0) {
        setError("No editors available");
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
    } else if (input === "1") {
      // Filter: All status
      setStatusFilter("all");
    } else if (input === "2") {
      // Filter: Unread only
      setStatusFilter("unread");
    } else if (input === "3") {
      // Filter: Read only
      setStatusFilter("read");
    } else if (input === "4") {
      // Filter: Done only
      setStatusFilter("done");
    } else if (input === "5") {
      // Filter: Unread and not done
      setStatusFilter("unread-not-done");
    } else if (input === "C") {
      // Filter: Should close (uppercase C to avoid conflict with vim navigation)
      setCloseRecommendFilter(closeRecommendFilter === "close" ? "all" : "close");
    } else if (input === "K") {
      // Filter: Should keep (uppercase K to avoid conflict with vim navigation)
      setCloseRecommendFilter(closeRecommendFilter === "keep" ? "all" : "keep");
    } else if (input === "w" || input === "W") {
      // Open in web browser
      await openInBrowser();
    } else if (key.escape) {
      // Clear all filters and modes on ESC
      setFilterText("");
      setFilterMode(false);
      setJumpMode(false);
      setJumpInput("");
      setStatusFilter("all");
      setCloseRecommendFilter("all");
    } else if (input === "?") {
      setShowHelp(true);
    } else if (input === "q") {
      exit();
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
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
          <Text>  <Text color="green">D</Text> - Mark as done</Text>
          <Text>  <Text color="green">Shift+D</Text> - Unmark as done</Text>

          <Box marginTop={1}>
            <Text bold>Filters:</Text>
          </Box>
          <Text>  <Text color="green">/</Text> - Search by text</Text>
          <Text>  <Text color="green">1</Text> - All | <Text color="green">2</Text> - Unread | <Text color="green">3</Text> - Read | <Text color="green">4</Text> - Done | <Text color="green">5</Text> - Unread+NotDone</Text>
          <Text>  <Text color="green">Shift+C</Text> - Toggle "Should Close" filter</Text>
          <Text>  <Text color="green">Shift+K</Text> - Toggle "Should Keep" filter</Text>
          <Text>  <Text color="green">ESC</Text> - Clear all filters</Text>

          <Box marginTop={1}>
            <Text bold>Other:</Text>
          </Box>
          <Text>  <Text color="green">?</Text> - Show this help</Text>
          <Text>  <Text color="green">Q</Text> - Quit</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press any key to continue...</Text>
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
      {filterMode && (
        <Box borderStyle="single" paddingX={1} marginBottom={1}>
          <Text>Filter: </Text>
          <TextInput
            value={filterText}
            onChange={setFilterText}
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
      />

      <StatusBar
        total={stats.total}
        unread={stats.unread}
        read={stats.read}
        filter={
          [
            filterText && `search:"${filterText}"`,
            statusFilter !== "all" && `status:${statusFilter.replace("-", " ")}`,
            closeRecommendFilter !== "all" && `recommend:${closeRecommendFilter}`,
          ]
            .filter(Boolean)
            .join(" ") || filter
        }
      />
    </Box>
  );
};
