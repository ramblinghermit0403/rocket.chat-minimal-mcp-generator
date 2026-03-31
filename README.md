# 🚀 Gemini CLI — Rocket.Chat MCP Server Generator

> A production-grade CLI that dynamically generates scoped, AI-ready [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers from the Rocket.Chat OpenAPI specification — powered by a Dynamic AST Scaffolding Engine.

---

## 🎬 Demo

https://github.com/user-attachments/assets/07d8e46c-3b32-41d5-901c-8c6ef9cc5483

---

## ✨ What Is This?

This tool lets you describe a Rocket.Chat use case in plain English and instantly receive a fully compiled, production-ready MCP server that exposes only the API capabilities relevant to your workflow. The generated server can be plugged directly into any MCP host — **Claude Desktop**, **Cursor**, or any custom agent.

```
"I want to kick a user from a channel"
         ↓  Gemini semantic analysis
    Capabilities: channels_kick, users_info
         ↓  Dynamic AST Scaffolding Engine
    Generated: out-mcp/build/server.js
         ↓  One command
    Running in Claude Desktop
```

---

## 🏗️ Architecture

```
gemini-cli-rocketchat-mcp/
├── src/
│   ├── index.ts              # CLI entry point (generate, chat, install commands)
│   ├── generator/
│   │   └── mcp.ts            # Dynamic AST Scaffolding Engine
│   ├── parser/
│   │   └── openapi.ts        # OpenAPI $ref resolver (swagger-parser)
│   └── semantic/
│       └── search.ts         # Intent → workflow mapping
├── scripts/
│   └── merge-openapi.ts      # Merges Rocket.Chat OpenAPI spec files
├── merged-openapi.json       # Pre-merged Rocket.Chat OpenAPI spec
└── out-mcp/                  # Generated MCP server (git-ignored)
    └── build/server.js
```

### Dynamic AST Engine

Instead of hardcoded tool definitions, the generator:
1. Uses `@apidevtools/swagger-parser` to fully dereference all `$ref` pointers in the OpenAPI spec
2. Walks the AST to extract endpoint schemas for only the requested workflows
3. Scaffolds a complete, type-safe MCP server with accurate JSON Schema tool definitions
4. Auto-builds the output with `npm install && tsc`

---

## 📋 Prerequisites

- Node.js 18+
- A running Rocket.Chat instance (local Docker or remote)
- Rocket.Chat API credentials (User ID + Auth Token)

### Get Your Credentials
Log in to your Rocket.Chat admin account, then:
```
Admin → My Account → Personal Access Tokens → Create Token
```

---

## 🚀 Quick Start

### 1. Install
```bash
git clone https://github.com/<your-username>/gemini-cli-rocketchat-mcp
cd gemini-cli-rocketchat-mcp
npm install
npm run build
npm link   # Makes 'gemini' available globally
```

### 2. Generate a Scoped MCP Server
```bash
gemini generate -i
```

You'll be prompted:
```
✨ Welcome to the Gemini AI Rocket.Chat Server Generator ✨

Describe your use case: I want to kick a user from a channel

🤖 Gemini recommends: kickUser, onboardUser

Proceed? (Y/n): y

✅ Build complete! Server is fully compiled and ready to test.
```

### 3. Test Your Server
```bash
export RC_USER_ID="your_user_id"
export RC_AUTH_TOKEN="your_auth_token"

gemini chat \
  --mcp "node out-mcp/build/server.js" \
  --prompt "kick rocket.cat from general"
```

### 4. Install into Claude Desktop
```bash
gemini install
# → Writes to ~/AppData/Roaming/Claude/claude_desktop_config.json
# → Restart Claude Desktop → 🔨 hammer icon confirms tools are loaded
```

---

## 📖 CLI Commands

### `gemini generate`

Generates a scoped MCP server from the Rocket.Chat OpenAPI spec.

```bash
gemini generate [options]

Options:
  -s, --spec <file>       Path to OpenAPI spec JSON/YAML  [default: merged-openapi.json]
  -w, --workflows <list>  Comma-separated workflow names  [default: provisionChannel,broadcastMessage]
  -o, --outDir <dir>      Output directory                [default: ./out-mcp]
  -i, --interactive       AI-guided interactive mode
```

**Interactive mode** (`-i`) lets Gemini analyze your plain-English description and recommend the best matching Rocket.Chat workflows automatically.

---

### `gemini chat`

Tests the generated MCP server using a real MCP client with natural language prompt routing.

```bash
gemini chat --mcp "<command>" --prompt "<text>"

# Example:
gemini chat \
  --mcp "node out-mcp/build/server.js" \
  --prompt "kick rocket.cat from the general channel"
```

The client:
1. Spawns the MCP server process (with full env var inheritance)
2. Performs the complete MCP handshake (initialize → capabilities)
3. Routes the prompt to the matched tool via keyword analysis
4. Calls the tool and displays the live Rocket.Chat API response

---

### `gemini install`

Installs the generated server into Claude Desktop's config file.

```bash
gemini install [options]

Options:
  --mcp-dir <dir>         Path to out-mcp directory  [default: ./out-mcp]
  --rc-url <url>          Rocket.Chat URL            [default: http://localhost:3000]
  --rc-user-id <id>       RC User ID                 [default: $RC_USER_ID env var]
  --rc-auth-token <token> RC Auth Token              [default: $RC_AUTH_TOKEN env var]
```

---

## 🔐 Environment Variables

| Variable | Description | Required |
|---|---|---|
| `RC_URL` | Rocket.Chat server URL | No (default: `http://localhost:3000`) |
| `RC_USER_ID` | Your Rocket.Chat User ID | **Yes** |
| `RC_AUTH_TOKEN` | Your Rocket.Chat Auth Token | **Yes** |

Set them before any command:
```bash
export RC_USER_ID="bebcLTPed56WAFbZW"
export RC_AUTH_TOKEN="your_token_here"
```

---

## 🧪 Supported Workflows

| Workflow ID | Description | Tools Generated |
|---|---|---|
| `kickUser` | Remove a user from a channel | `channels_kick` |
| `onboardUser` | Create and configure a new user | `users_create` |
| `inviteUser` | Invite a user to a channel | `channels_invite` |
| `provisionChannel` | Create and set up a new channel | `channels_create` |
| `broadcastMessage` | Post a message to a channel | `chat_postMessage` |

> **Note:** The generator dynamically reads these from the OpenAPI AST so new endpoints added to the Rocket.Chat API are automatically available.

---

## 🖥️ Using with Claude Desktop

After running `gemini install`, restart Claude Desktop. The 🔨 hammer icon in the chat input confirms your Rocket.Chat tools are loaded.

**Example prompts you can use:**
- *"Kick rocket.cat from the general channel"* → `channels_kick`
- *"Create a new user named John with email john@example.com"* → `users_create`
- *"Invite alice to the #announcements channel"* → `channels_invite`

---

## 🧩 How the Generated Server Works

The generated `out-mcp/build/server.js`:
- Runs as a **stdio-based MCP server** (compatible with all MCP hosts)
- Reads credentials from environment variables at startup
- Exposes tools derived from your selected workflows with accurate JSON Schema
- Routes tool calls through a **universal fetch router** to the Rocket.Chat REST API
- Returns structured responses for both success and error cases

---

## 🔮 Roadmap (GSoC 2025)

- [ ] **Phase 1:** Full OpenAPI AST coverage (all 300+ Rocket.Chat endpoints)
- [ ] **Phase 2:** Name-to-ID resolver tools (`channels_list`, `users_info`) for seamless natural language operation
- [ ] **Phase 3:** LLM schema bridge — native Gemini `FunctionDeclaration` generation from MCP JSON Schemas
- [ ] **Phase 4:** Multi-step agentic workflows (e.g. "onboard a new team member" → create user → add to channels → send welcome message)

---

## 📄 License

MIT
