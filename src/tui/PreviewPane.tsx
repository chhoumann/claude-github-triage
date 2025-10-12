import React from "react";
import { Box, Text } from "ink";
import type { IssueMetadata } from "../review-manager";

interface PreviewPaneProps {
  issue: IssueMetadata | null;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ issue }) => {
  if (!issue) {
    return (
      <Box
        borderStyle="single"
        borderLeft={true}
        paddingX={1}
        paddingY={1}
        flexDirection="column"
        width="50%"
      >
        <Text dimColor>No issue selected</Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="single"
      borderLeft={true}
      paddingX={1}
      paddingY={1}
      flexDirection="column"
      width="50%"
    >
      <Box flexDirection="column">
        <Text bold color="cyan">
          Issue #{issue.issueNumber}
        </Text>
        
        {issue.title && (
          <Box marginTop={1} marginBottom={1}>
            <Text bold>{issue.title}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column" gap={1}>
          <Box>
            <Text dimColor>Status: </Text>
            {issue.reviewStatus === "unread" ? (
              <Text color="yellow">Unread</Text>
            ) : (
              <Text color="gray">Read</Text>
            )}
            {issue.closedOnGitHub && <Text color="gray"> 🔒 Closed</Text>}
          </Box>

          {issue.shouldClose !== undefined && (
            <Box>
              <Text dimColor>Should Close: </Text>
              {issue.shouldClose ? (
                <Text color="red">Yes</Text>
              ) : (
                <Text color="green">No</Text>
              )}
            </Box>
          )}

          {issue.confidence && (
            <Box>
              <Text dimColor>Confidence: </Text>
              <Text
                color={
                  issue.confidence === "High"
                    ? "green"
                    : issue.confidence === "Medium"
                    ? "yellow"
                    : "red"
                }
              >
                {issue.confidence}
              </Text>
            </Box>
          )}

          {issue.labels && issue.labels.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Labels:</Text>
              <Box flexDirection="row" flexWrap="wrap" marginTop={0}>
                {issue.labels.map((label, idx) => (
                  <Box key={idx} marginRight={1}>
                    <Text color="cyan">{label}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>
              Triaged: {new Date(issue.triageDate).toLocaleString()}
            </Text>
          </Box>

          {issue.reviewDate && (
            <Box>
              <Text dimColor>
                Reviewed: {new Date(issue.reviewDate).toLocaleString()}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
