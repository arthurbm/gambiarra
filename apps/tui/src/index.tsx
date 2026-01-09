import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app";

export interface StartTUIOptions {
  hubUrl: string;
}

export async function startTUI(options: StartTUIOptions) {
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App hubUrl={options.hubUrl} />);
}

// Run standalone when executed directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  const hubIndex = args.indexOf("--hub");
  const customHub = hubIndex !== -1 ? args[hubIndex + 1] : undefined;
  const hubUrl = customHub ?? "http://localhost:3000";

  startTUI({ hubUrl });
}
