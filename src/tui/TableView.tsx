import React from "react";
import { Box, Text, useStdout } from "ink";
import type { IssueMetadata } from "../review-manager";
import { formatRelativeTime } from "./dateUtils";

interface TableViewProps {
  issues: IssueMetadata[];
  selectedIndex: number;
  visibleRows?: number;
  selectionMode?: boolean;
  selectedIssues?: Set<number>;
  perRowStatus?: Map<number, "idle" | "queued" | "running" | "done" | "skipped" | "error">;
}

export const TableView: React.FC<TableViewProps> = ({
  issues,
  selectedIndex,
  visibleRows = 20,
  selectionMode = false,
  selectedIssues = new Set(),
  perRowStatus = new Map(),
}) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 120;

  // Calculate scroll offset to keep selected item visible
  const scrollOffset = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleRows / 2), issues.length - visibleRows)
  );

  const visibleIssues = issues.slice(scrollOffset, scrollOffset + visibleRows);

  // Calculate dynamic title width based on terminal width
  // Fixed widths: checkbox(4) + issue#(7) + status(14) + recommend(11) + triaged(10) + created(10) + activity(10) + model(15) = 81
  const fixedWidth = (selectionMode ? 4 : 0) + 7 + 14 + 11 + 10 + 10 + 10 + 15;
  const titleWidth = Math.max(30, terminalWidth - fixedWidth - 4); // -4 for spacing and margins
  
  const formatStatus = (issue: IssueMetadata, rowStatus?: string): string => {
    // Show bulk triage status if running
    if (rowStatus === "running") return "⏳ Triaging";
    if (rowStatus === "done") return "✅ Done";
    if (rowStatus === "error") return "❌ Failed";
    if (rowStatus === "skipped") return "⏭ Skipped";

    const parts: string[] = [];
    if (issue.reviewStatus === "unread") parts.push("Unread");
    else parts.push("Read");
    if (issue.closedOnGitHub) parts.push("🔒");
    return parts.join(" ");
  };

  const formatRecommendation = (issue: IssueMetadata): string => {
    if (issue.shouldClose === true) return "🔴 Close";
    if (issue.shouldClose === false) return "✅ Keep";
    return "❓ Unknown";
  };

  const truncate = (str: string | undefined, maxLen: number): string => {
    if (!str) return "".padEnd(maxLen);
    return str.length > maxLen ? str.substring(0, maxLen - 1) + "…" : str.padEnd(maxLen);
  };

  const formatModel = (model: string | undefined): string => {
    if (!model) return "".padEnd(15);

    // Handle adapter names (claude, codex)
    if (model === "claude" || model === "codex") {
      return model.padEnd(15);
    }

    // Extract just the model name (e.g., "sonnet-4-5" from "claude-sonnet-4-5-20250929")
    const match = model.match(/claude-([\w-]+)-\d{8}/);
    if (match && match[1]) {
      return match[1].padEnd(15);
    }
    return model.substring(0, 14).padEnd(15);
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text bold dimColor>
          {selectionMode ? "[ ] ".padEnd(4) : ""}
          {"#".padEnd(7)} {"Status".padEnd(14)} {"Title".padEnd(titleWidth)} {"Recommend".padEnd(11)} {"Triaged".padEnd(10)} {"Created".padEnd(10)} {"Activity".padEnd(10)} {"Model".padEnd(15)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>{"─".repeat(Math.min(terminalWidth - 2, fixedWidth + titleWidth))}</Text>
      </Box>

      {/* Rows */}
      {visibleIssues.map((issue, idx) => {
        const actualIndex = scrollOffset + idx;
        const isSelected = actualIndex === selectedIndex;
        const isChecked = selectedIssues.has(issue.issueNumber);
        const rowStatus = perRowStatus.get(issue.issueNumber);

        return (
          <Box key={issue.issueNumber}>
            <Text
              backgroundColor={isSelected ? "blue" : undefined}
              color={issue.reviewStatus === "unread" ? "yellow" : "gray"}
            >
              {selectionMode ? (isChecked ? "[✓] " : "[ ] ") : ""}
              {isSelected ? "▶ " : "  "}
              {`#${issue.issueNumber}`.padEnd(7)}
              {formatStatus(issue, rowStatus).padEnd(14)}
              {truncate(issue.title, titleWidth)}
              {formatRecommendation(issue).padEnd(11)}
              {formatRelativeTime(issue.triageDate).padEnd(10)}
              {formatRelativeTime(issue.createdAt).padEnd(10)}
              {formatRelativeTime(issue.updatedAt).padEnd(10)}
              {formatModel(issue.model)}
            </Text>
          </Box>
        );
      })}

      {/* Footer showing scroll position */}
      {issues.length > visibleRows && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + visibleRows, issues.length)} of {issues.length}
          </Text>
        </Box>
      )}
    </Box>
  );
};
