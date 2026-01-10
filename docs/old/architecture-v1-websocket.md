# Gambiarra Club - Nova Arquitetura

## Visão Geral

Sistema que permite pessoas em uma rede local criarem "salas" onde participantes expõem seus endpoints Ollama locais para serem consumidos pelo criador da sala via SDK compatível com AI SDK.

## Decisões de Design

| Aspecto | Decisão |
|---------|---------|
| Runtime | Bun |
| Transporte | WebSocket + Pub/Sub nativo do Bun |
| Estrutura | Monorepo (Better T Stack + Turbo) |
| AI SDK | Wrapper sobre @ai-sdk/ollama |
| Metadata | ID + modelo + specs + config completa Ollama |
| Linting | Biome + Ultracite |
| Docs | Starlight (PT-BR + EN) |
| SDK | Gerar via OpenAPI para extensibilidade |

## Logo ASCII

```
 ██████╗  █████╗ ███╗   ███╗██████╗ ██╗ █████╗ ██████╗ ██████╗  █████╗
██╔════╝ ██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔══██╗
██║  ███╗███████║██╔████╔██║██████╔╝██║███████║██████╔╝██████╔╝███████║
██║   ██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██║██╔══██╗██╔══██╗██╔══██║
╚██████╔╝██║  ██║██║ ╚═╝ ██║██████╔╝██║██║  ██║██║  ██║██║  ██║██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
                          LLM CLUB
```

---

## Arquitetura

```
                    ┌─────────────────────────────────────────┐
                    │           GAMBIARRA HUB                 │
                    │      (Bun + WebSocket Pub/Sub)          │
                    │                                          │
                    │  Salas: room:abc123, room:xyz789...     │
                    └─────────────────────────────────────────┘
                           ▲              ▲              ▲
              join         │              │              │   create
                           │              │              │
                    ┌──────┴──────┐ ┌─────┴─────┐ ┌──────┴──────┐
                    │ Participante│ │Participante│ │   Host      │
                    │ (Ollama)    │ │ (Ollama)   │ │ (SDK)       │
                    └─────────────┘ └────────────┘ └─────────────┘
```

**Fluxo:**
1. Host cria sala via CLI → recebe código (ex: `ABC123`)
2. Participantes rodam `gambiarra join ABC123` → expõem Ollama local
3. Host usa SDK para consumir LLMs dos participantes
4. Hub faz relay de requests/responses via WebSocket pub/sub

---

## Estrutura do Monorepo (Atual)

Projeto já iniciado com Better T Stack:

```
gambiarra/
├── apps/
│   ├── docs/                    # Starlight (PT-BR + EN) - HOME do projeto
│   │   ├── src/content/docs/
│   │   │   ├── pt-br/           # Docs em português
│   │   │   └── en/              # Docs em inglês
│   │   └── astro.config.mjs
│   │
│   └── tui/                     # TUI opcional (@opentui/react)
│       └── src/
│           └── index.tsx
│
├── packages/
│   ├── config/                  # Config compartilhado (já existe)
│   │
│   ├── core/                    # Lógica compartilhada
│   │   └── src/
│   │       ├── index.ts         # Exports
│   │       ├── protocol.ts      # Schemas Zod das mensagens
│   │       ├── room.ts          # Namespace Room
│   │       ├── participant.ts   # Namespace Participant
│   │       ├── hub.ts           # Hub WebSocket (Bun.serve)
│   │       └── types.ts         # Tipos compartilhados
│   │
│   ├── cli/                     # CLI gambiarra (inclui hub)
│   │   └── src/
│   │       ├── index.ts         # Entry point
│   │       ├── commands/
│   │       │   ├── serve.ts     # gambiarra serve [--tui]
│   │       │   ├── create.ts    # gambiarra create
│   │       │   ├── join.ts      # gambiarra join <code>
│   │       │   └── list.ts      # gambiarra list
│   │       ├── ollama.ts        # Cliente Ollama local
│   │       └── logo.ts          # ASCII art logo
│   │
│   └── sdk/                     # SDK TypeScript (AI SDK compatible)
│       ├── openapi.json         # OpenAPI spec (para gerar SDKs)
│       └── src/
│           ├── index.ts         # Exports
│           ├── client.ts        # WebSocket client
│           ├── provider.ts      # AI SDK provider wrapper
│           └── gen/             # Código gerado do OpenAPI
│
├── biome.json                   # Linting (já existe)
├── turbo.json                   # Build orchestration (já existe)
└── package.json                 # Workspace root (já existe)
```

---

## TUI - Abordagem Recomendada

**Inspirado no OpenCode**: CLI e TUI são separados mas integrados.

### Modelo "Spawn + Attach"

```
gambiarra serve           → Inicia hub (headless, AI-friendly)
gambiarra serve --tui     → Inicia hub + spawna TUI automaticamente
gambiarra tui             → Conecta TUI a um hub existente
```

### Por que separar?

1. **AI-friendly**: CLI headless funciona bem com agentes de IA
2. **Flexibilidade**: TUI pode ser attached/detached sem perder estado
3. **Monitoramento remoto**: Conectar TUI de outra máquina
4. **Estabilidade**: Crash na TUI não afeta o hub

### Comunicação

- TUI conecta ao hub via WebSocket (mesmo protocolo dos clientes)
- TUI é "observador" - não expõe LLM, apenas monitora
- Recebe eventos de participantes entrando/saindo, status das salas

```typescript
// TUI se registra como observador
{ type: "tui:register", roomCode?: string }
→ { type: "tui:registered", rooms: Room[], participants: Participant[] }

// Eventos que TUI recebe
→ { type: "room:created", room: Room }
→ { type: "room:participant-joined", roomId: string, participant: Participant }
→ { type: "llm:token", ... }  // Se monitorando uma sala específica
```

---

## Protocolo WebSocket

### Mensagens do Sistema

```typescript
// Criar sala
{ type: "room:create", name: string }
→ { type: "room:created", code: string, roomId: string }

// Entrar na sala
{
  type: "room:join",
  code: string,
  participant: {
    id: string,
    nickname: string,
    model: string,
    specs: MachineSpecs,
    config: OllamaConfig
  }
}
→ { type: "room:joined", roomId: string, participants: Participant[] }

// Participante entrou (broadcast)
→ { type: "room:participant-joined", participant: Participant }

// Participante saiu (broadcast)
→ { type: "room:participant-left", participantId: string }
```

### Mensagens LLM

```typescript
// Request (host → participante)
{
  type: "llm:request",
  requestId: string,
  targetId: string,        // participantId ou "*" broadcast
  prompt: string,
  options?: Partial<OllamaConfig>
}

// Token (participante → host)
{
  type: "llm:token",
  requestId: string,
  participantId: string,
  token: string,
  seq: number
}

// Complete
{
  type: "llm:complete",
  requestId: string,
  participantId: string,
  metrics: {
    tokens: number,
    latencyFirstTokenMs: number,
    durationMs: number,
    tokensPerSecond: number
  }
}

// Error
{
  type: "llm:error",
  requestId: string,
  participantId: string,
  error: string
}
```

---

## Tipos Principais

```typescript
// Configurações do Ollama (participante escolhe ao dar join)
interface OllamaConfig {
  temperature?: number;      // default 0.8
  top_k?: number;            // default 40
  top_p?: number;            // default 0.9
  min_p?: number;            // default 0.0
  repeat_penalty?: number;   // default 1.1
  repeat_last_n?: number;    // default 64
  num_ctx?: number;          // default 2048
  num_predict?: number;      // default -1 (infinite)
  seed?: number;
  stop?: string[];
}

// Specs da máquina do participante
interface MachineSpecs {
  gpu?: string;              // "RTX 4090", "M3 Max"
  vram?: number;             // GB
  ram?: number;              // GB
  cpu?: string;
}

// Participante
interface Participant {
  id: string;
  nickname: string;
  model: string;             // "llama3.2:3b"
  config: OllamaConfig;
  specs: MachineSpecs;
  status: "online" | "busy" | "offline";
  joinedAt: number;
}

// Sala
interface Room {
  id: string;
  code: string;              // "ABC123"
  name: string;
  hostId: string;
  participants: Map<string, Participant>;
  createdAt: number;
}
```

---

## SDK - Uso com AI SDK

```typescript
import { createGambiarra } from "@gambiarra/sdk";
import { streamText } from "ai";

// Conectar a uma sala
const gambiarra = await createGambiarra({
  hubUrl: "ws://localhost:3000",
  roomCode: "ABC123"
});

// Listar participantes disponíveis
const participants = gambiarra.participants;
// → [{ id: "joao-rtx4090", model: "llama3.2:3b", ... }]

// Usar modelo de um participante específico
const result = await streamText({
  model: gambiarra.model("joao-rtx4090"),
  prompt: "Explique computação quântica"
});

// Ou usar qualquer participante com o modelo especificado
const result2 = await streamText({
  model: gambiarra.model("llama3.2:3b"), // primeiro disponível
  prompt: "Escreva um poema"
});

// Streaming
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

---

## CLI - Comandos

```bash
# Iniciar hub (servidor)
gambiarra serve [--port 3000]

# Criar sala (requer hub rodando)
gambiarra create "Minha Sala" [--hub ws://localhost:3000]
# → Sala criada! Código: ABC123

# Entrar em uma sala (expõe Ollama local)
gambiarra join ABC123 \
  --nickname "João" \
  --model "llama3.2:3b" \
  --ollama-url "http://localhost:11434" \
  --temperature 0.7 \
  --top-p 0.9 \
  --num-ctx 4096

# Listar salas/participantes
gambiarra list [--hub ws://localhost:3000]
```

---

## Documentação (Starlight)

### Estrutura i18n

```
apps/docs/src/content/docs/
├── en/
│   ├── index.mdx              # Home (também é landing page do projeto)
│   ├── getting-started.mdx
│   ├── cli/
│   │   ├── serve.mdx
│   │   ├── create.mdx
│   │   ├── join.mdx
│   │   └── list.mdx
│   ├── sdk/
│   │   ├── installation.mdx
│   │   ├── usage.mdx
│   │   └── api-reference.mdx
│   └── guides/
│       ├── hosting-a-room.mdx
│       └── joining-a-room.mdx
│
└── pt-br/
    └── (mesma estrutura)
```

### Home como Landing Page

A home da docs deve servir como landing page do projeto:
- Hero com logo ASCII
- Descrição do projeto
- Quick start (3 comandos)
- Links para docs detalhadas

---

## Implementação - Fases

### Fase 1: Core + Estrutura (já parcialmente feito)
1. ~~Setup monorepo Bun + Turbo~~ ✓
2. ~~Biome + Ultracite~~ ✓
3. ~~Starlight docs~~ ✓
4. `@gambiarra/core` - tipos, schemas Zod, hub WebSocket
5. Logo ASCII colorida

### Fase 2: CLI
6. `@gambiarra/cli` - comandos serve, create, join, list
7. Integração com Ollama local (streaming)
8. Detecção automática de specs da máquina
9. Flag `--tui` para spawn automático

### Fase 3: SDK
10. OpenAPI spec (`packages/sdk/openapi.json`)
11. `@gambiarra/sdk` - cliente WebSocket
12. Provider wrapper para AI SDK (@ai-sdk/ollama)
13. Geração de código via OpenAPI (para futuras SDKs)

### Fase 4: TUI
14. TUI como observador do hub
15. Dashboard de salas e participantes
16. Visualização de streaming em tempo real

### Fase 5: Docs + Refinamentos
17. Docs em PT-BR e EN
18. Landing page no Starlight
19. Reconexão automática com backoff
20. Exemplos e guias

---

## Distribuição

### Estratégias de Distribuição

| Método | Uso | Comando |
|--------|-----|---------|
| npm (SDK) | Desenvolvedores usando SDK | `bun add @gambiarra/sdk` |
| npm (CLI) | Instalação global da CLI | `bun add -g @gambiarra/cli` |
| Binário standalone | Usuários finais sem Bun | Download do GitHub Releases |

### Publicação no npm (`bun publish`)

```bash
# Publicar SDK
cd packages/sdk && bun publish --access public

# Publicar CLI
cd packages/cli && bun publish --access public
```

O `bun publish` automaticamente:
- Remove `workspace:*` do package.json
- Resolve versions dos catalogs
- Cria tarball e envia pro registry

### Executáveis Standalone (`bun build --compile`)

```bash
# Build para a plataforma atual
bun build --compile --minify ./packages/cli/src/index.ts --outfile gambiarra

# Cross-compile para todas as plataformas
bun build --compile --target=bun-linux-x64 ./packages/cli/src/index.ts --outfile dist/gambiarra-linux-x64
bun build --compile --target=bun-linux-arm64 ./packages/cli/src/index.ts --outfile dist/gambiarra-linux-arm64
bun build --compile --target=bun-darwin-x64 ./packages/cli/src/index.ts --outfile dist/gambiarra-darwin-x64
bun build --compile --target=bun-darwin-arm64 ./packages/cli/src/index.ts --outfile dist/gambiarra-darwin-arm64
bun build --compile --target=bun-windows-x64 ./packages/cli/src/index.ts --outfile dist/gambiarra-windows-x64.exe
```

### Build Script (`scripts/build.ts`)

```typescript
const targets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64"
];

for (const target of targets) {
  await Bun.build({
    entrypoints: ["./packages/cli/src/index.ts"],
    compile: {
      target,
      outfile: `./dist/gambiarra-${target.replace("bun-", "")}`,
    },
    minify: true,
    sourcemap: "linked",
  });
}
```

### GitHub Actions (CI/CD)

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: bun-linux-x64
          - os: ubuntu-latest
            target: bun-linux-arm64
          - os: macos-latest
            target: bun-darwin-x64
          - os: macos-latest
            target: bun-darwin-arm64
          - os: windows-latest
            target: bun-windows-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun build --compile --target=${{ matrix.target }} --minify ./packages/cli/src/index.ts --outfile gambiarra
      - uses: actions/upload-artifact@v4
        with:
          name: gambiarra-${{ matrix.target }}
          path: gambiarra*
```

---

## Separação CLI vs TUI

### Por que CLI é `package` e TUI é `app`?

```
packages/cli/     → Biblioteca + binário publicável no npm
apps/tui/         → Aplicação standalone, não publicada separadamente
```

### CLI (`packages/cli`)

- **É um package npm**: Publicado como `@gambiarra/cli` ou `gambiarra`
- **Exporta binário**: `"bin": { "gambiarra": "./dist/index.js" }`
- **Contém toda a lógica**: Hub WebSocket, comandos, integração Ollama
- **Pode ser compilado**: `bun build --compile` gera executável standalone
- **Instalável globalmente**: `bun add -g @gambiarra/cli`

```json
// packages/cli/package.json
{
  "name": "@gambiarra/cli",
  "bin": {
    "gambiarra": "./dist/index.js"
  },
  "dependencies": {
    "@gambiarra/core": "workspace:*"
  }
}
```

### TUI (`apps/tui`)

- **É uma aplicação**: Não publicada no npm separadamente
- **Usa @opentui/react**: Interface de terminal rica
- **Conecta ao Hub**: Via WebSocket (mesmo protocolo dos clientes)
- **Iniciada pela CLI**: `gambiarra serve --tui` spawna a TUI

```json
// apps/tui/package.json
{
  "name": "tui",
  "private": true,  // NÃO publicada
  "dependencies": {
    "@gambiarra/core": "workspace:*",
    "@opentui/react": "^0.1.67"
  }
}
```

### Fluxo de Spawn

```typescript
// packages/cli/src/commands/serve.ts
export async function serve(options: ServeOptions) {
  // 1. Inicia o hub
  const hub = Hub.listen({ port: options.port });

  // 2. Se --tui, spawna a TUI como processo separado
  if (options.tui) {
    const tuiPath = require.resolve("tui/src/index.tsx");
    Bun.spawn({
      cmd: ["bun", "run", tuiPath, "--hub", hub.url],
      stdio: "inherit",  // TUI usa o terminal
    });
  }

  // 3. CLI continua rodando (hub ativo)
  await hub.waitForClose();
}
```

### Build do Executável com TUI Embutida

Para distribuir um único executável que inclui a TUI:

```typescript
// scripts/build-with-tui.ts
await Bun.build({
  entrypoints: [
    "./packages/cli/src/index.ts",
    "./apps/tui/src/index.tsx"  // Incluir TUI
  ],
  compile: {
    outfile: "./dist/gambiarra",
  },
  minify: true,
});
```

A CLI detecta se está rodando como binário compilado e usa o entrypoint interno:

```typescript
// packages/cli/src/commands/serve.ts
if (options.tui) {
  if (Bun.embeddedFiles.length > 0) {
    // Executável compilado: TUI está embutida
    Bun.spawn({ cmd: [process.execPath, "tui", "--hub", hub.url] });
  } else {
    // Dev mode: spawna arquivo separado
    Bun.spawn({ cmd: ["bun", "run", "apps/tui/src/index.tsx", "--hub", hub.url] });
  }
}
```

---

## Inspirações do OpenCode

- **Namespace Pattern**: `Room.create()`, `Participant.register()`
- **Schemas Zod com .meta()**: Documentação integrada
- **Monorepo com exports granulares**: `@gambiarra/sdk/client`
- **Event Bus para comunicação interna**
- **Turbo para build orchestration**
- **TUI separada da CLI (spawn + attach)**
- **OpenAPI para gerar SDKs**
