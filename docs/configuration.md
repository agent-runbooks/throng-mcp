# throng-mcp — configuration

For users. The install steps are in [README.md](../README.md); the tool contracts in [DESIGN §3](DESIGN.md#3-external-contract).

## Config file

Optional, `~/.config/throng/config.yaml`. Every key has a default; an empty or missing file is fine.

```yaml
# Permissions (see Permissions below).
harness_mode: auto        # auto | ask: the harness's own auto-approve mode, or its asking mode
permission_answers: deny  # auto | allow | deny | elicit: how throng answers what the harness asks
# permissions: auto       # shorthand for both: auto | allow_all | deny_all | elicit

# Overrides of the built-in harnesses, all optional. Only the built-in ids go here.
harnesses:
  # claude:
  #   env: { CLAUDE_CODE_OAUTH_TOKEN: "..." }  # extra adapter env; e.g. auth when the standalone `claude` isn't logged in
  # codex:
  #   harness_mode: ask                        # per-harness override, key by key
  #   permission_answers: elicit
  # opencode:
  #   command: /opt/opencode                   # adapter outside PATH: absolute path, or a name looked up on PATH
  #   args: [acp]                              # replaces the default args
  #   env: { X: "1" }
  # gemini:
  #   permissions: deny_all                    # the shorthand per harness; ids: claude, codex, opencode, gemini

# Other ACP agents, all optional (see Custom harnesses below).
custom_harnesses:
  # kimi:
  #   command: kimi                            # required
  #   args: [acp]
  #   auto_mode: { mode: yolo }                # under harness_mode auto
  #   ask_mode: { mode: default }              # under harness_mode ask

limits:
  timeout_s: 21600       # default turn timeout (6 h)
  handshake_s: 60        # adapter start + session setup
  elicitation_s: 600     # how long a permission dialog waits for an answer
  max_concurrency: 10    # parallel turns per server process
  max_depth: 2           # nested throng → harness → throng → … levels
```

Unknown keys are rejected. A broken config is logged on server start and shows up in every `list_harnesses` `unavailable` reason; `run_thronglet` refuses to run until it's fixed. It never falls back to defaults, which might be less strict than what you meant.

## Custom harnesses

Any ACP agent besides the four built-in harnesses can be described under `custom_harnesses.<id>`. The entry is the whole definition: throng installs nothing, looks nothing up in the ACP registry, and doesn't guess commands or modes. Then `run_thronglet` takes `<id>/<model>[:<effort>]` and `list_harnesses` probes it like the others.

```yaml
custom_harnesses:
  kimi:
    command: kimi
    args: [acp]
    env: { KIMI_X: "1" }
    harness_mode: ask
    permission_answers: allow
    auto_mode:
      mode: yolo
      config_options: { permission: bypass, brave_mode: true }
      args: []
      env: {}
    ask_mode:
      mode: default
```

- The id is letters, digits, `.`, `_` and `-`, starting with a letter or digit (no `/` or `:`, which the agent spec uses).
- An id equal to a built-in one (`custom_harnesses.claude`) replaces the built-in harness everywhere, `harnesses.claude` included, and the server logs a warning at start.
- `command` (required): a name looked up on PATH, or a path containing `/`. `args` and `env` are what throng launches it with; `env` is added to the server's environment.
- `harness_mode`, `permission_answers` and the `permissions` shorthand: the per-harness overrides, as for the built-in harnesses.
- `auto_mode` is used under `harness_mode: auto`, `ask_mode` under `harness_mode: ask`. Each takes:
  - `mode`: a session mode id, set after the session starts and on every resumed turn. Strict: if the agent rejects it, the run fails.
  - `config_options`: `{ <option id>: <value> }`, set after the mode. A string is a select option's value, `true`/`false` a boolean option's. Best effort: an option the agent doesn't advertise, or rejects, is a warning and the turn runs anyway.
  - `args`: appended to `args` for the runs in that harness mode.
  - `env`: added to `env` for the runs in that harness mode.

  `list_harnesses` launches the agent with `command`, `args` and `env` only.
- Without `auto_mode`, `harness_mode: auto` leaves the agent in the mode it starts in, and the result warns `custom_harnesses.<id>.auto_mode is not set: <id> runs in the mode it starts in`. Whatever that mode asks about goes to `permission_answers`; under the default `deny` the agent can do only what its starting mode allows without asking. `auto_mode: {}` says that on purpose and silences the warning.
- Without `ask_mode`, `harness_mode: ask` also leaves the starting mode, without a warning; throng answers the permission requests as `permission_answers` says.
- Model: the agent's `model` config option, or the `models` list of the session; a model it doesn't offer is `model_rejected`.
- Effort: the level is set only when the agent's effort (`thought_level`) option has exactly that value; otherwise it is a warning. No mapping between levels.
- An entry without `command`, or an id outside the characters above, is a config error.

An agent that needs more than this (a different effort scale, special session parameters, filtering its chatter) needs a built-in harness definition in throng's code.

## Environment variables

| variable | meaning |
|---|---|
| `THRONG_MCP_CONFIG` | config path instead of `~/.config/throng/config.yaml` |
| `THRONG_MCP_CACHE_DIR` | cache dir instead of `~/.cache/throng` (session records, kept 14 days) |
| `THRONG_MCP_DEPTH` | nesting depth; set by throng for its children, you don't set it by hand |

## Permissions

Two settings, from the config only, never from a tool parameter, so the calling model can't grant itself more than the config allows. Both can be set globally and per harness (`harnesses.<harness>`, `custom_harnesses.<id>`); a per-harness value overrides the global one key by key.

`harness_mode` is the mode throng puts the harness in:

- `auto` (default): the harness's own auto-approve mode (Claude `auto`, Codex `agent`, OpenCode as configured, Gemini `yolo`). It decides most actions itself and asks about the rest.
- `ask`: its asking mode (Claude `default`, Codex `read-only`, OpenCode with every permission set to `ask`, Gemini `default`). Edits, shell and MCP tools are asked about.

`permission_answers` is how throng answers what the harness asks:

- `deny` (default): rejected.
- `allow`: allowed.
- `elicit`: shown to you as a dialog in the MCP client: the thronglet's description, the tool title, kind, input truncated to 2 KB, paths, and the choices the harness offered. Your answer goes to the agent; Decline rejects, dismissing the dialog or no answer within `limits.elicitation_s` cancels the request, and the agent carries on either way. Needs an MCP client that supports form elicitation (Claude Code does); otherwise the call fails with `elicitation_unsupported` before anything starts, the message naming the key to change.
- `auto`: "decide for me". Today that is `elicit` when the client supports it, otherwise `deny`, without an error or a warning on the result.

So `harness_mode: auto` with `permission_answers: auto` is "the harness decides on its own, and what it still asks goes to you". The defaults, auto + deny, never widen what the harness's auto mode approves.

**`harness_mode: auto` with `permission_answers: allow` is effectively bypass**: the harness approves what it can, throng approves the rest. throng allows it, since only your config can set it.

`permissions` is the older single setting, kept as a shorthand for a pair:

| `permissions` | `harness_mode` | `permission_answers` |
|---|---|---|
| `auto` | `auto` | `deny` |
| `allow_all` | `ask` | `allow` |
| `deny_all` | `ask` | `deny` |
| `elicit` | `ask` | `elicit` |

It works at the same places. At one place, `permissions` together with `harness_mode` or `permission_answers` is a config error: use one or the other.

Answers are always one-time options, never "always allow" (Claude would write that rule into the project settings). throng's own `submit_result` (structured output) is allowed under every setting. Cancelling a run answers its pending requests `cancelled` and closes any open dialog.

Dialogs, when they are on:

- A pending dialog holds the thronglet's turn until you answer or `limits.elicitation_s` passes.
- Claude Code doesn't move a call to the background while a dialog is pending.
- Dialogs can come from background and parallel thronglets; the description at the start of the message says which one asks.
- A throng call inside a thronglet has no dialogs, since its client is the harness: there `permission_answers: auto` answers as `deny` and an explicit `elicit` fails with `elicitation_unsupported`.

Claude Code has no auto mode for some models (haiku, for one) and falls back to accept-edits. throng warns `permission mode "auto" not applied: the agent switched to "acceptEdits"`; file edits are still auto-approved, anything else the harness asks about goes to `permission_answers` (rejected by default). Pick another model if you need the real auto mode.

Gemini CLI runs with its workspace trusted (`GEMINI_CLI_TRUST_WORKSPACE=true`) under both harness modes: in an untrusted folder it refuses `yolo` and starts no MCP servers, throng's `submit_result` included. In its `default` mode read-only tools run without asking; edits, shell and MCP tools ask.

## Auth

The nested harness uses whatever login its CLI has. If `claude auth status` says not logged in, put `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) into `harnesses.claude.env` as in the config above. Codex, OpenCode and Gemini CLI use their own logins: `codex login`, `opencode auth login`, and a first run of `gemini` to sign in. OpenCode custom providers live in your `~/.config/opencode/opencode.json`; throng doesn't touch it.

## Effort

The `:<effort>` suffix of the agent spec is taken as effort only when it is `low | medium | high | xhigh | max`, so a model name with its own `:tag` stays intact. Claude takes the level as is; Codex too, with `max` falling back to `xhigh` if absent. OpenCode's ACP adapter exposes no effort option (1.18.31), so a suffix there only produces a warning. Gemini CLI has no effort knob over ACP either: always a warning. An effort the harness doesn't offer is a warning, not an error.

## Troubleshooting

| what you see | what to do |
|---|---|
| `harness_unavailable` | the adapter isn't on PATH, and the message carries the install command; or the config is broken (message starts with `config error:`): fix the yaml, throng won't run on defaults |
| `harness_unavailable` on a custom harness | `<command> (custom_harnesses.<id>.command) not found on PATH`: install the agent or fix `command` (a name on PATH or a path). `Unknown harness "<id>"`: the id is neither built in nor in the config; the message lists the valid ones. A session whose custom harness has since left the config gets the same error from `send_message`, unless its id is a built-in one: then the built-in harness gets the message |
| `elicitation_unsupported` | `permission_answers: elicit` (or `permissions: elicit`), globally or per harness, but the MCP client has no elicitation support; the message names the key. Use a client that has it, or set the key to another value (`permission_answers: auto` asks when it can and rejects otherwise) |
| `model_rejected` | the model isn't one of the harness's values. Call `list_harnesses` for the current list; they are the harness's own option values and change with harness versions |
| `handshake_timeout`, `spawn_failed`, `handshake_failed` | the message includes the adapter's stderr. Usual cause is auth: check `claude auth status` (or set `CLAUDE_CODE_OAUTH_TOKEN` in config), `codex login`, `opencode auth login`, `gemini` (sign in once). Slow first start: raise `limits.handshake_s` |
| `empty_result` | the agent ended its turn without saying anything; the harness's own session log shows what it did |
| `timeout` | raise `timeout_s` for the call or `limits.timeout_s`. The payload keeps `session_id` and any partial `text` |
| anything else | the server log (stderr of the server; the MCP client decides where it ends up), then the harness's session log by `session_id`. throng keeps no transcripts |
