import React from "react";
import { Box, Text } from "ink";

interface AdapterPickerProps {
  onSelect: (adapter: "claude" | "codex") => void;
  onCancel: () => void;
  lastAdapter?: "claude" | "codex";
}

export const AdapterPicker: React.FC<AdapterPickerProps> = ({
  onSelect,
  onCancel,
  lastAdapter,
}) => {
  return (
    <Box borderStyle="single" paddingX={1} marginBottom={1}>
      <Text>
        <Text bold color="cyan">Bulk triage adapter:</Text>
        {" "}
        <Text color="green">1</Text> Claude
        {" | "}
        <Text color="green">2</Text> Codex
        {lastAdapter && (
          <>
            {" | "}
            <Text dimColor>Enter for {lastAdapter}</Text>
          </>
        )}
        {" | "}
        <Text dimColor>ESC cancel</Text>
      </Text>
    </Box>
  );
};
