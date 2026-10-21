# throng-mcp

## 0.8.1

### Patch Changes

- [#29](https://github.com/agent-runbooks/throng-mcp/pull/29) [`9955f43`](https://github.com/agent-runbooks/throng-mcp/commit/9955f4333ff56197b5b9d3ff2240bc67adc9259b) Thanks [@Nodge](https://github.com/Nodge)! - When a structured result is missing, the corrective prompt now tells the agent to finish the task first if it hasn't, and only then reply with the JSON. Before, an agent whose turn had broken off (for example on a Codex backend error) answered the bare "reply with only the JSON" with a "failed" result instead of doing the work. See [Structured output](https://github.com/agent-runbooks/throng-mcp/blob/main/skills/throng/SKILL.md#structured-output).

- [#29](https://github.com/agent-runbooks/throng-mcp/pull/29) [`9955f43`](https://github.com/agent-runbooks/throng-mcp/commit/9955f4333ff56197b5b9d3ff2240bc67adc9259b) Thanks [@Nodge](https://github.com/Nodge)! - A harness that isn't logged in now fails with `harness_unavailable` instead of `handshake_failed` (or `session_not_found` on `send_message`), with the adapter's message. For Codex the message ends with `; log in: codex login`; Cursor's own message already says to run `agent login`. See the [troubleshooting table](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/configuration.md#troubleshooting).

## 0.8.0

### Minor Changes

- [#26](https://github.com/agent-runbooks/throng-mcp/pull/26) [`ebf760d`](https://github.com/agent-runbooks/throng-mcp/commit/ebf760d888fddeb534cea360d78d6abe11f85ca0) Thanks [@Nodge](https://github.com/Nodge)! - Structured output no longer goes through an MCP tool. With `schema`, throng adds the schema to the prompt and takes the result from the agent's final message, which must be only a JSON value matching it (a ```json fence is fine). A missing or invalid result still gets up to two corrective prompts, then `structured_missing` or `structured_invalid`. throng now approves no permission request on its own. This closes a hole in 0.7.0: under `harness_mode: ask`, a shell command that named throng's old `submit_result` tool was approved even with `permission_answers: deny`. Structured output now works the same on every harness and under every permission setting, including Gemini CLI 0.62+ and custom harnesses. See [Structured output](https://github.com/agent-runbooks/throng-mcp/blob/main/skills/throng/SKILL.md#structured-output).

## 0.7.0

### Minor Changes

- [#22](https://github.com/agent-runbooks/throng-mcp/pull/22) [`3a3158f`](https://github.com/agent-runbooks/throng-mcp/commit/3a3158fe64cc48e405449b1a9e63098dba13baa4) Thanks [@Nodge](https://github.com/Nodge)! - GitHub Copilot CLI as a harness: `copilot/<model>` runs your installed Copilot CLI with its own login, so the models of your Copilot subscription are available. Install it with `npm i -g @github/copilot` and run `copilot login` once. After that `list_harnesses` shows its models. By default Copilot approves its own tool calls. With `harness_mode: ask` it asks before shell commands and file edits, and throng answers as `permission_answers` says. Follow-ups with `send_message` and `steer: true` work, and so does structured output with `schema`. If Copilot is signed in only through the GitHub CLI, it offers no models and every run fails with `model_rejected`, so sign in with `copilot login`. See [GitHub Copilot CLI](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#github-copilot-cli).

- [#21](https://github.com/agent-runbooks/throng-mcp/pull/21) [`510286d`](https://github.com/agent-runbooks/throng-mcp/commit/510286d6faf44e03b0af4ba113318f6178087a73) Thanks [@Nodge](https://github.com/Nodge)! - `list_harnesses` now lists only the harnesses you have. A built-in harness whose adapter isn't installed no longer shows up under `unavailable` with an install hint, so the calling agent doesn't spend context on harnesses it can't run. `unavailable` is left for harnesses that are installed or configured but can't run: a config error, a configured `command` that isn't found, a failed probe. To find out what to install for a missing harness, call `run_thronglet` with it: it fails with `harness_unavailable` and the install command, as before. See [Check](https://github.com/agent-runbooks/throng-mcp/blob/main/README.md#check).

## 0.6.0

### Minor Changes

- [#19](https://github.com/agent-runbooks/throng-mcp/pull/19) [`fcf9252`](https://github.com/agent-runbooks/throng-mcp/commit/fcf92528293952db8a5295bbff212a5e03b9a906) Thanks [@Nodge](https://github.com/Nodge)! - Cursor CLI as a harness: `cursor/<model>` runs your installed Cursor CLI with its own login, so the models of your Cursor subscription are available, Composer included. Install it with `curl https://cursor.com/install -fsS | bash` and run `agent login` once. After that `list_harnesses` shows its models. Follow-ups work: `send_message` and `steer: true` continue a Cursor session. Note that Cursor applies file edits on its own, whatever `harness_mode` and `permission_answers` say. Those settings cover only what it asks about: shell commands, MCP tools and web search. See [Cursor CLI](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/harnesses.md#cursor-cli).

- [#19](https://github.com/agent-runbooks/throng-mcp/pull/19) [`fcf9252`](https://github.com/agent-runbooks/throng-mcp/commit/fcf92528293952db8a5295bbff212a5e03b9a906) Thanks [@Nodge](https://github.com/Nodge)! - A model can now be given by its name alone when the harness lists a single variant of it, for example `cursor/gpt-5.4-nano` for `gpt-5.4-nano[reasoning=medium]`. This works for every harness. When a name fits several variants, the error lists them.

## 0.5.0

### Minor Changes

- [#11](https://github.com/agent-runbooks/throng-mcp/pull/11) [`0efa455`](https://github.com/agent-runbooks/throng-mcp/commit/0efa455181e74770bbc8d02b60ede10eda6de173) Thanks [@Nodge](https://github.com/Nodge)! - You can now run any ACP agent, not only the built-in Claude Code, Codex, OpenCode and Gemini CLI. Add the agent to your throng config with the command that starts it, and call it like the others: `kimi/<model>`. If the agent has an auto-approve mode, name it in the config too, and throng switches to it under the default `harness_mode: auto`. See [Custom harnesses](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/configuration.md#custom-harnesses).

- [#12](https://github.com/agent-runbooks/throng-mcp/pull/12) [`8f4080c`](https://github.com/agent-runbooks/throng-mcp/commit/8f4080c45f61e237bbf276e788a2af4b51909b7f) Thanks [@Nodge](https://github.com/Nodge)! - Permissions are now two config keys instead of one. `harness_mode: auto | ask` picks the mode the harness runs in: its own auto-approve mode or its asking mode. `permission_answers: auto | allow | deny | elicit` picks how throng answers what the harness still asks. This adds a combination that was not possible before: with `harness_mode: auto` and `permission_answers: auto` the harness approves what it can on its own, and its remaining requests come to you as a dialog in Claude Code. `permission_answers: auto` falls back to refusing when the client has no dialogs, for example inside a thronglet. Both keys work globally and per harness. The defaults (`auto` + `deny`) behave like the old default, and `permissions: auto | allow_all | deny_all | elicit` still works as a shorthand, so existing configs need no change. The permission dialog now names the thronglet by its description. See [Permissions](https://github.com/agent-runbooks/throng-mcp/blob/main/docs/configuration.md#permissions).

## 0.4.0

### Minor Changes

- [`2ead051`](https://github.com/agent-runbooks/throng-mcp/commit/2ead0514c0aa957262f290fcf5b75bc0e678b770) Thanks [@Nodge](https://github.com/Nodge)! - Gemini CLI as a harness: `gemini/<model>` runs through Gemini CLI's own ACP mode (`gemini --acp`), with the Google-account login of the installed CLI. `list_harnesses` shows its models. Limits: a gemini session is one turn (`send_message` fails with `session_not_found`, Gemini CLI can't resume a session), there are no effort levels and no usage numbers, and the run's `cwd` is trusted (`GEMINI_CLI_TRUST_WORKSPACE=true`).

- [`780ae7f`](https://github.com/agent-runbooks/throng-mcp/commit/780ae7fd05e079795ad9042f356b748fe10abd06) Thanks [@Nodge](https://github.com/Nodge)! - `send_message` to a session whose harness can't resume (Gemini CLI) is refused with `session_not_found` before anything runs: no adapter process is started, and `steer: true` no longer cancels the running turn first. The session record remembers what the adapter advertised when the session was created; sessions created by an earlier version fail at the next turn's handshake as before. `list_thronglets` shows such a session with the new field `accepts_messages: false`.

### Patch Changes

- [`c8b4a01`](https://github.com/agent-runbooks/throng-mcp/commit/c8b4a0107f95eb0e3adfe3c2a215a2edfa79d270) Thanks [@Nodge](https://github.com/Nodge)! - The `agent` parameter description and the docs no longer show `claude/opus[1m]` as an example: the claude adapter stopped offering that value.

- [`1eb5d4d`](https://github.com/agent-runbooks/throng-mcp/commit/1eb5d4d24cfed04fe48ff19bd23f0797bc9a3010) Thanks [@Nodge](https://github.com/Nodge)! - A harness definition can now express the permission policy through `session/set_config_option` and extra launch args, next to the session mode and env. The built-in harnesses (claude, codex, opencode) behave as before; this prepares agents such as Copilot CLI and Cursor that switch auto-approval this way.

- [`b7463d7`](https://github.com/agent-runbooks/throng-mcp/commit/b7463d729ee6c4be5cf97126bee89cabc874d03c) Thanks [@Nodge](https://github.com/Nodge)! - The repository moved to github.com/agent-runbooks/throng-mcp. The npm package name and the tools are the same.

## 0.3.0

### Minor Changes

- [`4e6b810`](https://github.com/Nodge/throng-mcp/commit/4e6b810538b3ed288c266d1904739d1c1dda7a57) Thanks [@Nodge](https://github.com/Nodge)! - Claude Code plugin: `claude plugin marketplace add Nodge/throng-mcp`, then `claude plugin install throng@throng-mcp` installs the server and the skill together.

### Patch Changes

- [`ca5d875`](https://github.com/Nodge/throng-mcp/commit/ca5d8750a7cd26e4146473c9dcb230abac95b79f) Thanks [@Nodge](https://github.com/Nodge)! - An agent's `fs/*` call to throng (OpenCode sends `fs/write_text_file` after an approved edit) no longer adds a warning to the result; it is still answered "method not found" and logged to stderr. `terminal/*` calls keep the warning.

- [`4e6b810`](https://github.com/Nodge/throng-mcp/commit/4e6b810538b3ed288c266d1904739d1c1dda7a57) Thanks [@Nodge](https://github.com/Nodge)! - The `run_thronglet` description no longer lists the harnesses or limits the work to coding; `list_harnesses` has the current set.

## 0.2.0

### Minor Changes

- [`1317631`](https://github.com/Nodge/throng-mcp/commit/131763166f799da4fd457b0477446be10c381fa2) Thanks [@Nodge](https://github.com/Nodge)! - The package is self-contained: the runtime libraries (`@agentclientprotocol/sdk`, `@modelcontextprotocol/sdk`, `ajv`, `yaml`, `zod`) are bundled into `dist/`, and `package.json` has no `dependencies`. `npx -y throng-mcp` fetches one tarball and resolves nothing else; the versions a user runs are the ones the release was tested with. `dist/THIRD_PARTY_LICENSES.md` lists every bundled package with its license text.

## 0.1.1

### Patch Changes

- [`85d24ff`](https://github.com/Nodge/throng-mcp/commit/85d24ff3313788cda62cf9edaf8528b7677f1f16) Thanks [@Nodge](https://github.com/Nodge)! - Release notes for the first version, 0.1.0 shipped without a changelog. No code changes.
  
  throng-mcp is an MCP server that hands a task from one coding agent to another over ACP (Agent Client Protocol) and returns the final message into the calling session.
  
  - Tools: `run_thronglet` (new session, first turn), `send_message` (next turn in the same session; `steer: true` interrupts the running turn), `wait_thronglet`, `list_thronglets`, `cancel_thronglet`, `list_harnesses`.
  - Harnesses: Claude Code and Codex through their ACP adapters (`@agentclientprotocol/claude-agent-acp`, `@agentclientprotocol/codex-acp`), OpenCode natively (`opencode acp`) with every model it can reach. `agent` is one string, `<harness>/<model>[:<effort>]`.
  - Background turns: `background: true` returns once the turn runs; `wait_thronglet` collects the result, also after a server restart.
  - Structured output: pass a JSON Schema and the agent submits a matching result through an injected `throng_result` MCP tool, with up to two corrective prompts.
  - Permission policies from the config: `auto` (each harness's own auto-approve mode), `allow_all`, `deny_all`, `elicit` (every request goes to the human through the MCP client's elicitation).
  - Config in `~/.config/throng/config.yaml`: per-harness command, args, env, auth; limits for concurrency, nesting depth and the default timeout. Session records in `~/.cache/throng/sessions`, rotated after 14 days.
  - Published as a tsdown bundle with the `throng-mcp` bin: `npx -y throng-mcp` in any MCP client config; Node `^22.13 || >=24`.
  - `skills/throng`: a skill for the calling agent on when to delegate, how to write the prompt, follow-ups, background runs and structured output.
