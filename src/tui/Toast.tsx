import React from "react";
import { Box, Text } from "ink";

export type ToastLevel = "info" | "warn" | "error" | "success";

export interface ToastMessage {
  message: string;
  level: ToastLevel;
  expiresAt?: number;
}

interface ToastProps {
  toast: ToastMessage;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  const getColor = (level: ToastLevel): string => {
    switch (level) {
      case "error":
        return "red";
      case "warn":
        return "yellow";
      case "success":
        return "green";
      case "info":
      default:
        return "cyan";
    }
  };

  const getIcon = (level: ToastLevel): string => {
    switch (level) {
      case "error":
        return "✗";
      case "warn":
        return "⚠";
      case "success":
        return "✓";
      case "info":
      default:
        return "ℹ";
    }
  };

  return (
    <Box borderStyle="single" paddingX={1} marginBottom={1}>
      <Text color={getColor(toast.level)}>
        {getIcon(toast.level)} {toast.message}
      </Text>
    </Box>
  );
};
