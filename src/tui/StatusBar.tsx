import React from "react";
import { Box, Text } from "ink";

const Spinner: React.FC = () => {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frameIndex, setFrameIndex] = React.useState(0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);
  
  return <Text color="cyan">{frames[frameIndex]}</Text>;
};

const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

interface StatusBarProps {
  total: number;
  unread: number;
  read: number;
  filter: string;
  helpVisible?: boolean;
  currentProject?: string;
  selectionMode?: boolean;
  selectedCount?: number;
  syncing?: boolean;
  lastSyncAt?: number | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  total,
  unread,
  read,
  filter,
  helpVisible = false,
  currentProject,
  selectionMode = false,
  selectedCount = 0,
  syncing = false,
  lastSyncAt = null,
}) => {
  return (
    <Box borderStyle="single" borderTop={true} paddingX={1}>
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between">
          <Box>
            <Text>
              {currentProject && (
                <>
                  <Text color="magenta" bold>📁 {currentProject}</Text>
                  <Text dimColor> | </Text>
                </>
              )}
              <Text color="yellow">Unread: {unread}</Text>
              <Text dimColor> | </Text>
              <Text color="gray">Read: {read}</Text>
              <Text dimColor> | </Text>
              <Text>Total: {total}</Text>
            </Text>
          </Box>
          <Box>
            {filter !== "all" && (
              <Text>
                <Text dimColor>Filter: </Text>
                <Text color="cyan">{filter}</Text>
                <Text> </Text>
              </Text>
            )}
            {syncing ? (
              <Text>
                <Text color="cyan">⟳ Syncing </Text>
                <Spinner />
              </Text>
            ) : lastSyncAt ? (
              <Text dimColor>⟳ {formatTimeAgo(lastSyncAt)}</Text>
            ) : null}
          </Box>
        </Box>
        {!helpVisible && (
          <Box marginTop={1}>
            <Text dimColor>
              {selectionMode ? (
                <>
                  <Text color="cyan" bold>SELECTION MODE</Text>
                  {" | "}
                  <Text color="green">Selected: {selectedCount}</Text>
                  {selectedCount > 0 ? " | T Bulk Triage | " : " | "}
                  {"Space Toggle | A All | I Invert | V Exit | ESC Clear"}
                </>
              ) : (
                "↑/↓ Nav | Enter Open | W Web | D Done | R/U Mark | 1-5 Status | C/K Close | / Search | S Sync | V Select | ? Help"
              )}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
