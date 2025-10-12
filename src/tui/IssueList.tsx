import React from "react";
import { Box, Text } from "ink";
import type { IssueMetadata } from "../review-manager";

interface IssueListProps {
  issues: IssueMetadata[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export const IssueList: React.FC<IssueListProps> = ({
  issues,
  selectedIndex,
}) => {
  return (
    <Box flexDirection="column" width="50%" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Issues ({issues.length})</Text>
      </Box>
      <Box flexDirection="column">
        {issues.map((issue, index) => {
          const isSelected = index === selectedIndex;
          const isUnread = issue.reviewStatus === "unread";

          return (
            <Box key={issue.issueNumber}>
              <Text
                backgroundColor={isSelected ? "blue" : undefined}
                color={isUnread ? "yellow" : "gray"}
                bold={isSelected}
              >
                {isSelected ? "▶ " : "  "}
                {isUnread ? "📄" : "✅"} #{issue.issueNumber}
                {issue.closedOnGitHub && " 🔒"}
                {issue.shouldClose === true && " 🔴"}
              </Text>
            </Box>
          );
        })}
        {issues.length === 0 && (
          <Text dimColor>No issues found matching your filter</Text>
        )}
      </Box>
    </Box>
  );
};
