import { cpus, platform, totalmem } from "node:os";
import { $ } from "bun";

export interface MachineSpecs {
  cpu: string;
  ram: number; // in GB
  gpu?: string;
  vram?: number; // in GB
}

async function detectGPU(): Promise<{ gpu?: string; vram?: number }> {
  const os = platform();

  try {
    if (os === "linux") {
      // Try nvidia-smi first (NVIDIA GPUs)
      try {
        const result =
          await $`nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`
            .text()
            .catch(() => null);

        if (result) {
          const parts = result.trim().split(", ");
          const name = parts[0];
          const vramMB = parts[1];
          if (name && vramMB) {
            return {
              gpu: name,
              vram: Math.round(Number.parseInt(vramMB, 10) / 1024),
            };
          }
        }
      } catch {
        // nvidia-smi not available
      }

      // Fallback to lspci for any GPU
      const lspci = await $`lspci 2>/dev/null | grep -i 'vga\\|3d\\|display'`
        .text()
        .catch(() => null);

      if (lspci) {
        const match = lspci.match(/: (.+)$/m);
        if (match?.[1]) {
          return { gpu: match[1].trim() };
        }
      }
    } else if (os === "darwin") {
      // macOS
      const result = await $`system_profiler SPDisplaysDataType 2>/dev/null`
        .text()
        .catch(() => null);

      if (result) {
        const chipMatch = result.match(/Chip(?:set)? Model: (.+)/);
        const vramMatch = result.match(/VRAM.*?: (\d+)/);
        const vramValue = vramMatch?.[1];

        return {
          gpu: chipMatch?.[1]?.trim(),
          vram: vramValue
            ? Math.round(Number.parseInt(vramValue, 10) / 1024)
            : undefined,
        };
      }
    } else if (os === "win32") {
      // Windows
      const result =
        await $`wmic path win32_VideoController get name,adapterram /format:csv`
          .text()
          .catch(() => null);

      if (result) {
        const lines = result.trim().split("\n").filter(Boolean);
        const dataLine = lines[1];
        if (dataLine) {
          const parts = dataLine.split(",");
          const adapterRam = parts[1];
          const name = parts[2];
          return {
            gpu: name?.trim(),
            vram: adapterRam
              ? Math.round(Number.parseInt(adapterRam, 10) / 1024 / 1024 / 1024)
              : undefined,
          };
        }
      }
    }
  } catch {
    // GPU detection failed
  }

  return {};
}

export async function detectSpecs(): Promise<MachineSpecs> {
  const cpuInfo = cpus();
  const cpu = cpuInfo[0]?.model ?? "Unknown";
  const ram = Math.round(totalmem() / 1024 / 1024 / 1024); // Convert to GB

  const gpuInfo = await detectGPU();

  return {
    cpu,
    ram,
    ...gpuInfo,
  };
}

export function formatSpecs(specs: MachineSpecs): string {
  const parts = [`CPU: ${specs.cpu}`, `RAM: ${specs.ram}GB`];

  if (specs.gpu) {
    parts.push(`GPU: ${specs.gpu}`);
  }
  if (specs.vram) {
    parts.push(`VRAM: ${specs.vram}GB`);
  }

  return parts.join(" | ");
}
