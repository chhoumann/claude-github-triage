import React from "react";
import { Box, Text } from "ink";
import type { IssueMetadata } from "../review-manager";

interface TableViewProps {
  issues: IssueMetadata[];
  selectedIndex: number;
  visibleRows?: number;
}

export const TableView: React.FC<TableViewProps> = ({
  issues,
  selectedIndex,
  visibleRows = 20,
}) => {
  // Calculate scroll offset to keep selected item visible
  const scrollOffset = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleRows / 2), issues.length - visibleRows)
  );
  
  const visibleIssues = issues.slice(scrollOffset, scrollOffset + visibleRows);
  
  const formatStatus = (issue: IssueMetadata): string => {
    const parts: string[] = [];
    if (issue.reviewStatus === "unread") parts.push("Unread");
    else parts.push("Read");
    if (issue.isDone) parts.push("✓Done");
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
    // Extract just the model name (e.g., "sonnet-4-5" from "claude-sonnet-4-5-20250929")
    const match = model.match(/claude-([\w-]+)-\d{8}/);
    if (match) {
      return match[1].padEnd(15);
    }
    return model.substring(0, 14).padEnd(15);
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text bold dimColor>
          {"#".padEnd(7)} {"Status".padEnd(14)} {"Title".padEnd(60)} {"Recommend".padEnd(11)} {"Model".padEnd(15)}
        </Text>
      </Box>
      <Box>
        <Text dimColor>{"─".repeat(120)}</Text>
      </Box>

      {/* Rows */}
      {visibleIssues.map((issue, idx) => {
        const actualIndex = scrollOffset + idx;
        const isSelected = actualIndex === selectedIndex;
        
        return (
          <Box key={issue.issueNumber}>
            <Text
              backgroundColor={isSelected ? "blue" : undefined}
              color={issue.reviewStatus === "unread" ? "yellow" : "gray"}
            >
              {isSelected ? "▶ " : "  "}
              {`#${issue.issueNumber}`.padEnd(7)}
              {formatStatus(issue).padEnd(14)}
              {truncate(issue.title, 60)}
              {formatRecommendation(issue).padEnd(11)}
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
