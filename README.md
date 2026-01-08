```
 ██████╗  █████╗ ███╗   ███╗██████╗ ██╗ █████╗ ██████╗ ██████╗  █████╗
██╔════╝ ██╔══██╗████╗ ████║██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔══██╗
██║  ███╗███████║██╔████╔██║██████╔╝██║███████║██████╔╝██████╔╝███████║
██║   ██║██╔══██║██║╚██╔╝██║██╔══██╗██║██╔══██║██╔══██╗██╔══██╗██╔══██║
╚██████╔╝██║  ██║██║ ╚═╝ ██║██████╔╝██║██║  ██║██║  ██║██║  ██║██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
                          LLM CLUB
```

<div align="center">

**Share local LLMs across your network, effortlessly.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3.5-black?logo=bun&logoColor=white)](https://bun.sh)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-ef4444?logo=turborepo&logoColor=white)](https://turbo.build/repo)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-Compatible-000000?logo=vercel&logoColor=white)](https://sdk.vercel.ai)

[Quick Start](#-quick-start) • [Documentation](./docs/architecture.md) • [Examples](#-usage-examples)

</div>

---

## 📖 What is Gambiarra?

**Gambiarra** is a local-first LLM sharing system that allows multiple users on a network to pool their LLM resources together. Think of it as a "LLM Club" where everyone shares their Ollama, LM Studio, LocalAI, or any OpenAI-compatible endpoint.

### Why Gambiarra?

- **🏠 Local-First**: Your data stays on your network
- **🤝 Resource Sharing**: Pool LLM endpoints across your team
- **🔌 Universal Compatibility**: Works with any OpenAI-compatible API
- **🚀 Vercel AI SDK Integration**: Drop-in replacement for your AI SDK workflows
- **🔍 Auto-Discovery**: mDNS/Bonjour support for zero-config networking
- **📊 Real-time Monitoring**: Beautiful TUI for tracking room activity
- **⚡ Production Ready**: Built with TypeScript, Bun, and modern tooling

---

## 🎯 Use Cases

- **Development Teams**: Share expensive LLM endpoints across your team
- **Hackathons**: Pool resources for AI projects
- **Research Labs**: Coordinate LLM access across multiple workstations
- **Home Labs**: Share your gaming PC's LLM with your laptop
- **Education**: Classroom environments where students share compute

---

## ✨ Features

### 🎮 CLI Interface

```bash
# Start a hub server
gambiarra serve --mdns

# Create a room
gambiarra create

# Join with your endpoint
gambiarra join ABC123 --endpoint http://localhost:11434 --model llama3

# List available rooms
gambiarra list
```

### 🔧 SDK Integration

```typescript
import { createGambiarra } from "@gambiarra/sdk";
import { generateText } from "ai";

const gambiarra = createGambiarra({ roomCode: "ABC123" });

// Use any available participant
const result = await generateText({
  model: gambiarra.any(),
  prompt: "Explain quantum computing",
});

// Target specific participant
const result2 = await generateText({
  model: gambiarra.participant("joao"),
  prompt: "Write a haiku about TypeScript",
});

// Route by model type
const result3 = await generateText({
  model: gambiarra.model("llama3"),
  prompt: "What is the meaning of life?",
});
```

### 📺 Terminal UI

Monitor rooms in real-time with a beautiful TUI:

```bash
cd apps/tui
bun run dev ABC123
```

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.3.5 or later
- An OpenAI-compatible LLM endpoint (Ollama, LM Studio, LocalAI, vLLM, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gambiarra.git
cd gambiarra

# Install dependencies
bun install

# Build all packages
bun run build
```

### Start Your First Room

**1. Start the Hub Server**

```bash
cd packages/cli
bun run src/cli.ts serve --port 3000 --mdns
```

**2. Create a Room**

```bash
# In another terminal
bun run src/cli.ts create
# Returns: Room created! Code: ABC123
```

**3. Join with Your LLM**

```bash
# On your machine (or a friend's)
bun run src/cli.ts join ABC123 \
  --endpoint http://localhost:11434 \
  --model llama3 \
  --nickname joao
```

**4. Use the SDK**

```typescript
import { createGambiarra } from "@gambiarra/sdk";
import { generateText } from "ai";

const gambiarra = createGambiarra({
  roomCode: "ABC123",
  hubUrl: "http://localhost:3000",
});

const result = await generateText({
  model: gambiarra.any(),
  prompt: "Hello, Gambiarra!",
});

console.log(result.text);
```

---

## 📦 Project Structure

```
gambiarra/
├── packages/
│   ├── core/              # Core library (Hub, Room, Protocol)
│   ├── cli/               # Command-line interface
│   └── sdk/               # Vercel AI SDK integration
├── apps/
│   ├── docs/              # Documentation site (Astro Starlight)
│   └── tui/               # Terminal UI for monitoring
└── docs/                  # Architecture documentation
```

### Packages

| Package | Description | Version |
|---------|-------------|---------|
| `@gambiarra/core` | Hub server, room management, SSE, mDNS | 0.0.1 |
| `@gambiarra/cli` | CLI for managing hubs and participants | 0.0.1 |
| `@gambiarra/sdk` | Vercel AI SDK provider | 0.0.1 |

---

## 🏗️ Architecture

Gambiarra uses a **HTTP + SSE architecture** for simplicity and compatibility:

```
┌─────────────────────────────────────────────────────────────┐
│                    GAMBIARRA HUB (HTTP)                     │
│                                                             │
│  Endpoints:                                                 │
│  • POST   /rooms                    (Create room)          │
│  • GET    /rooms                    (List rooms)           │
│  • POST   /rooms/:code/join         (Join room)            │
│  • POST   /rooms/:code/v1/chat/completions (Proxy)        │
│  • GET    /rooms/:code/events       (SSE updates)          │
└─────────────────────────────────────────────────────────────┘
       ▲                    ▲                      ▲
       │ HTTP               │ HTTP                 │ SSE
       │                    │                      │
  ┌────┴────┐    ┌─────────┴────────┐      ┌──────┴─────┐
  │   SDK   │    │  Participants    │      │    TUI     │
  └─────────┘    └──────────────────┘      └────────────┘
```

### Key Components

- **Hub**: Central HTTP server that routes requests and manages rooms
- **Participants**: LLM endpoints registered in a room (Ollama, LM Studio, etc.)
- **SDK**: Vercel AI SDK provider that proxies to the hub
- **TUI**: Real-time monitoring interface using Server-Sent Events

### Model Routing

| Pattern | Example | Description |
|---------|---------|-------------|
| **Participant ID** | `gambiarra.participant("joao")` | Route to specific participant |
| **Model Name** | `gambiarra.model("llama3")` | Route to first participant with model |
| **Any** | `gambiarra.any()` | Route to random online participant |

For detailed architecture, see [docs/architecture.md](./docs/architecture.md).

---

## 🔧 Usage Examples

### CLI Commands

#### Start a Hub

```bash
# Basic server
gambiarra serve --port 3000

# With mDNS auto-discovery
gambiarra serve --port 3000 --mdns
```

#### Create a Room

```bash
gambiarra create
# Output: Room created! Code: XYZ789
```

#### List Rooms

```bash
gambiarra list
# Output:
# Available rooms:
#   - ABC123 (3 participants)
#   - XYZ789 (1 participant)
```

#### Join a Room

```bash
# Ollama
gambiarra join ABC123 \
  --endpoint http://localhost:11434 \
  --model llama3 \
  --nickname alice

# LM Studio
gambiarra join ABC123 \
  --endpoint http://localhost:1234 \
  --model mistral \
  --nickname bob
```

### SDK Examples

#### Basic Chat

```typescript
import { createGambiarra } from "@gambiarra/sdk";
import { generateText } from "ai";

const gambiarra = createGambiarra({ roomCode: "ABC123" });

const result = await generateText({
  model: gambiarra.any(),
  prompt: "What is TypeScript?",
});

console.log(result.text);
```

#### Streaming

```typescript
import { createGambiarra } from "@gambiarra/sdk";
import { streamText } from "ai";

const gambiarra = createGambiarra({ roomCode: "ABC123" });

const stream = await streamText({
  model: gambiarra.model("llama3"),
  prompt: "Write a story about a robot",
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

#### With Custom Config

```typescript
const gambiarra = createGambiarra({
  roomCode: "ABC123",
  hubUrl: "http://192.168.1.100:3000",
});

const result = await generateText({
  model: gambiarra.any(),
  prompt: "Explain recursion",
  temperature: 0.7,
  maxTokens: 500,
});
```

### Terminal UI

```bash
cd apps/tui
bun install
bun run dev ABC123
```

The TUI provides real-time monitoring of:
- Active participants
- Current model loads
- Request history
- Participant health status

---

## 🛠️ Development

### Setup

```bash
# Install dependencies
bun install

# Run development server (all apps)
bun run dev

# Type checking
bun run check-types

# Linting and formatting (Ultracite/Biome)
bun x ultracite check
bun x ultracite fix
```

### Working with Packages

```bash
# Work on CLI
cd packages/cli
bun run dev serve --port 3000

# Work on Core
cd packages/core
bun run check-types

# Work on SDK
cd packages/sdk
bun run check-types
```

### Code Standards

This project uses [Ultracite](https://github.com/Kikobeats/ultracite), a zero-config preset for Biome. See [.claude/CLAUDE.md](./.claude/CLAUDE.md) for detailed code standards.

**Quick commands:**
- `bun x ultracite fix` - Auto-fix formatting and linting issues
- `bun x ultracite check` - Check for issues
- `bun x ultracite doctor` - Diagnose setup

---

## 🌐 Supported Providers

Gambiarra works with any **OpenAI-compatible API**:

| Provider | Default Endpoint | Notes |
|----------|------------------|-------|
| **Ollama** | `http://localhost:11434` | Most popular local LLM server |
| **LM Studio** | `http://localhost:1234` | GUI-based LLM management |
| **LocalAI** | `http://localhost:8080` | Self-hosted OpenAI alternative |
| **vLLM** | `http://localhost:8000` | High-performance inference |
| **text-generation-webui** | `http://localhost:5000` | Gradio-based interface |
| **Custom** | Any URL | Any OpenAI-compatible endpoint |

---

## 🔐 Security Considerations

- **Local Network Only**: Gambiarra is designed for trusted local networks
- **No Authentication**: Currently no built-in auth (use network isolation)
- **HTTP Only**: Uses plain HTTP (consider reverse proxy for HTTPS)
- **Participant Trust**: All participants can access shared models

For production use, consider:
- Running behind a reverse proxy (Caddy, Nginx)
- Using VPN or WireGuard for remote access
- Implementing authentication at the proxy level

---

## 🗺️ Roadmap

- [ ] Authentication & authorization
- [ ] Participant quotas and rate limiting
- [ ] Persistent room storage (SQLite/PostgreSQL)
- [ ] Load balancing across multiple participants
- [ ] Model capability negotiation
- [ ] Web UI for room management
- [ ] Docker/container support
- [ ] Metrics and observability
- [ ] Request queueing for busy participants

---

## 🤝 Contributing

Contributions are welcome! This is an early-stage project and we'd love your help.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `bun x ultracite fix` to format code
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Follow the code standards in [.claude/CLAUDE.md](./.claude/CLAUDE.md)
- Write type-safe TypeScript
- Add tests for new features
- Update documentation as needed

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [Turbo](https://turbo.build) - High-performance build system
- [Vercel AI SDK](https://sdk.vercel.ai) - AI integration framework
- [Biome](https://biomejs.dev) - Fast formatter and linter
- [Clipanion](https://github.com/arcanis/clipanion) - Type-safe CLI framework
- [Bonjour](https://github.com/onlxltd/bonjour-service) - mDNS service discovery

---

<div align="center">

**Made with ❤️ for the local LLM community**

[Report Bug](https://github.com/yourusername/gambiarra/issues) • [Request Feature](https://github.com/yourusername/gambiarra/issues)

</div>
