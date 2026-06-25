# Zen for VS Code

A native chat panel for the **Zen** agent, with its own UI — message bubbles,
collapsible thoughts, tool-call chips, a model/thinking picker, slash-command
autocomplete, and a cache-hit bar.

It is an **ACP client**: it spawns `zen acp` and speaks the Agent Client
Protocol over stdio, then renders everything in a custom webview. All of Zen's
engine (auth, tools, models) is reused as-is — this is purely the UI.

## Run it (development)

1. Make sure `zen` works in your terminal (the bundle is built and on PATH).
2. Open **this folder** (`editors/vscode`) in VS Code.
3. Press **F5** → "Run Zen Extension". A second VS Code window opens with the
   Zen icon in the Activity Bar. Click it to open the chat.

The build runs automatically (esbuild) before launch. No `npm install` is
needed here — `esbuild` and the ACP SDK resolve from the parent repo's
`node_modules`.

## Install it (use day to day)

```sh
# from editors/vscode
npx @vscode/vsce package --no-dependencies   # produces zen-vscode-0.1.0.vsix
code --install-extension zen-vscode-0.1.0.vsix
```

## Settings (`zen.*`)

| Setting            | Default   | Notes                                        |
| ------------------ | --------- | -------------------------------------------- |
| `zen.command`      | `zen`     | Command that starts the ACP agent.           |
| `zen.args`         | `["acp"]` | Args for that command.                       |
| `zen.cwd`          | _(empty)_ | Working dir; empty = first workspace folder. |
| `zen.showCacheBar` | `true`    | Show the cache-hit / cost bar.               |

Running from a checkout instead of the global `zen`? Set
`zen.command` = `node` and `zen.args` = `["<abs>/dist/zen.mjs", "acp"]`.

## How it maps to ACP

- streaming text → `agent_message_chunk`
- collapsible thoughts → `agent_thought_chunk`
- tool chips → `tool_call` / `tool_call_update`
- model + thinking pickers → `configOptions` / `setSessionConfigOption`
- slash-command menu → `available_commands_update`
- cache bar → parsed from Zen's `⚡ N% cached` usage line
- Stop → `session/cancel`; New Chat → fresh session (restarts the agent)
