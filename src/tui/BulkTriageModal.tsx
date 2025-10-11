import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export type BulkTriageParams = {
  adapter: "claude" | "codex";
  concurrency: number;
  force: boolean;
  timeoutMinutes: number;
  maxTurns: number;
  debug: boolean;
};

interface BulkTriageModalProps {
  onSubmit: (params: BulkTriageParams) => void;
  onCancel: () => void;
  defaultParams?: BulkTriageParams;
}

const DEFAULT_PARAMS: BulkTriageParams = {
  adapter: "claude",
  concurrency: 3,
  force: false,
  timeoutMinutes: 60,
  maxTurns: 100000,
  debug: true,
};

type Field = "adapter" | "concurrency" | "force" | "timeoutMinutes" | "maxTurns" | "debug";

export const BulkTriageModal: React.FC<BulkTriageModalProps> = ({
  onSubmit,
  onCancel,
  defaultParams,
}) => {
  const [params, setParams] = useState<BulkTriageParams>(defaultParams || DEFAULT_PARAMS);
  const [selectedField, setSelectedField] = useState<Field>("adapter");
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [inputValue, setInputValue] = useState("");

  const fields: Field[] = ["adapter", "concurrency", "force", "timeoutMinutes", "maxTurns", "debug"];

  useInput((input, key) => {
    if (editingField) {
      // Handled by TextInput
      return;
    }

    if (key.upArrow) {
      const currentIndex = fields.indexOf(selectedField);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
      setSelectedField(fields[prevIndex] as Field);
    } else if (key.downArrow) {
      const currentIndex = fields.indexOf(selectedField);
      const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
      setSelectedField(fields[nextIndex] as Field);
    } else if (key.return || input === " ") {
      // Toggle or edit field
      if (selectedField === "adapter") {
        setParams((p) => ({ ...p, adapter: p.adapter === "claude" ? "codex" : "claude" }));
      } else if (selectedField === "force" || selectedField === "debug") {
        setParams((p) => ({ ...p, [selectedField]: !p[selectedField] }));
      } else {
        // Edit numeric fields
        setEditingField(selectedField);
        setInputValue(String(params[selectedField]));
      }
    } else if (key.escape || input === "q") {
      onCancel();
    } else if (input === "s") {
      // Submit
      onSubmit(params);
    }
  });

  const handleInputSubmit = () => {
    if (editingField && inputValue) {
      const numValue = parseInt(inputValue, 10);
      if (!isNaN(numValue) && numValue > 0) {
        setParams((p) => ({ ...p, [editingField]: numValue }));
      }
    }
    setEditingField(null);
    setInputValue("");
  };

  const renderFieldValue = (field: Field): string => {
    const value = params[field];
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return String(value);
  };

  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Text bold color="cyan">
        Bulk Triage Parameters
      </Text>
      <Box marginTop={1} flexDirection="column">
        {fields.map((field) => {
          const isSelected = field === selectedField;
          const isEditing = field === editingField;
          const label = field === "adapter" ? "Adapter" :
                       field === "concurrency" ? "Concurrency" :
                       field === "force" ? "Force re-triage" :
                       field === "timeoutMinutes" ? "Timeout (minutes)" :
                       field === "maxTurns" ? "Max turns" :
                       "Debug logs";
          
          return (
            <Box key={field}>
              <Text color={isSelected ? "green" : undefined} bold={isSelected}>
                {isSelected ? "▶ " : "  "}
                {label.padEnd(20)}: {" "}
              </Text>
              {isEditing ? (
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleInputSubmit}
                />
              ) : (
                <Text color={isSelected ? "yellow" : "gray"}>
                  {renderFieldValue(field)}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ Navigate | Enter/Space Toggle/Edit | S Submit | ESC Cancel
        </Text>
      </Box>
    </Box>
  );
};
