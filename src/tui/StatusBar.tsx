import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  total: number;
  unread: number;
  read: number;
  filter: string;
  helpVisible?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  total,
  unread,
  read,
  filter,
  helpVisible = false,
}) => {
  return (
    <Box borderStyle="single" borderTop={true} paddingX={1}>
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between">
          <Box>
            <Text>
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
              </Text>
            )}
          </Box>
        </Box>
        {!helpVisible && (
          <Box marginTop={1}>
            <Text dimColor>
              ↑/↓ Nav | Enter Open | W Web | D Done | R/U Mark | 1-5 Status | C/K Close | / Search | ? Help
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
