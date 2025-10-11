import React from "react";
import { Box, Text } from "ink";

export type BulkTriageStatus = {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inFlight: number;
  startTime: number;
  activeIssues?: number[];
};

interface BulkTriageProgressProps {
  status: BulkTriageStatus;
}

export const BulkTriageProgress: React.FC<BulkTriageProgressProps> = ({ status }) => {
  const { total, completed, failed, skipped, inFlight, activeIssues = [] } = status;
  const [currentTime, setCurrentTime] = React.useState(Date.now());
  
  // Update timer every second
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const progress = total > 0 ? (completed + failed + skipped) / total : 0;
  const barWidth = 30;
  const filledWidth = Math.round(progress * barWidth);
  const bar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);
  
  const elapsed = Math.floor((currentTime - status.startTime) / 1000);
  const avgTimePerIssue = completed > 0 ? elapsed / completed : 0;
  const remaining = total - completed - failed - skipped;
  const eta = remaining > 0 && avgTimePerIssue > 0 ? Math.floor(remaining * avgTimePerIssue) : 0;
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Box borderStyle="single" borderTop={true} paddingX={1} flexDirection="column">
      <Box>
        <Text bold color="cyan">
          Bulk Triage Progress
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          [{bar}] {completed + failed + skipped}/{total}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="green">✓ {completed}</Text>
          <Text> | </Text>
          <Text color="yellow">⏭ {skipped}</Text>
          <Text> | </Text>
          <Text color="red">✗ {failed}</Text>
          <Text> | </Text>
          <Text color="cyan">▶ {inFlight}</Text>
          {activeIssues.length > 0 && <Text color="cyan"> (#{activeIssues.join(", #")})</Text>}
          <Text> | </Text>
          <Text dimColor>Elapsed: {formatTime(elapsed)}</Text>
          {eta > 0 && <Text dimColor> | ETA: ~{formatTime(eta)}</Text>}
        </Text>
      </Box>
    </Box>
  );
};
