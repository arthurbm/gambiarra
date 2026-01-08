import { colors } from "../types";

interface FooterProps {
  shortcuts?: Array<{ key: string; description: string }>;
}

const defaultShortcuts = [
  { key: "q", description: "Quit" },
  { key: "Tab", description: "Switch" },
  { key: "↑↓", description: "Navigate" },
  { key: "Enter", description: "Details" },
  { key: "a", description: "Add Room" },
];

export function Footer({ shortcuts = defaultShortcuts }: FooterProps) {
  return (
    <box borderStyle="single" paddingLeft={1} paddingRight={1}>
      <text>
        {shortcuts.map((shortcut, index) => (
          <span key={shortcut.key}>
            {index > 0 && "  "}
            <span fg={colors.primary}>{shortcut.key}</span>
            <span fg={colors.muted}> {shortcut.description}</span>
          </span>
        ))}
      </text>
    </box>
  );
}
