#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import { $, build } from "bun";

// 1. Limpar dist/
await rm("./dist", { recursive: true, force: true });
console.log("✓ Cleaned dist/");

// 2. Lista de entry points (todos os exports)
const entrypoints = [
  "./src/index.ts",
  "./src/provider.ts",
  "./src/types.ts",
  "./src/protocol.ts",
  "./src/rooms.ts",
  "./src/participants.ts",
  "./src/hub.ts",
  "./src/utils.ts",
  "./src/client.ts",
];

// 3. Build com bun (gera .js)
const result = await build({
  entrypoints,
  outdir: "./dist",
  target: "node",
  format: "esm",
  sourcemap: "external",
  minify: false,
  splitting: false, // Disabled to avoid duplicate exports
  external: [
    // Peer dependencies não devem ser bundladas
    "ai",
    "@ai-sdk/provider",
  ],
});

if (!result.success) {
  console.error("✗ Build failed");
  process.exit(1);
}

console.log(`✓ Built ${result.outputs.length} files`);

// 4. Gerar .d.ts files com tsc
await $`bun tsc --emitDeclarationOnly --outDir dist`;
console.log("✓ Generated type declarations");

console.log("✓ Build completed successfully");
