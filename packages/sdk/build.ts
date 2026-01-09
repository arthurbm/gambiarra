#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import { $, build } from "bun";

// 1. Limpar dist/
await rm("./dist", { recursive: true, force: true });
console.log("✓ Cleaned dist/");

// 2. Apenas 1 entrypoint para evitar bug de duplicate exports do bun
// O client é re-exportado pelo index, então não precisa de entrypoint separado
const entrypoints = ["./src/index.ts"];

// 3. Build com bun (gera .js)
const result = await build({
  entrypoints,
  outdir: "./dist",
  target: "node",
  format: "esm",
  sourcemap: "external",
  minify: false,
  splitting: true, // Funciona bem com poucos entrypoints
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
