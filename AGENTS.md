# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, and others) working in this repository.

## What this is

Super CLI is a VS Code extension (`vscode-super-cli`) that launches AI coding-agent CLIs (Claude
Code, Codex, Copilot CLI, and others) into native VS Code terminals from an activity-bar sidebar and
a quick-pick launcher. It has **zero runtime dependencies** — it only resolves and runs the shell
commands you configure; it never installs, wraps, or modifies a CLI or shell profile.

## Commands

```bash
npm ci                    # install
npm run compile           # tsc build: src/ -> out/
npm run watch              # tsc in watch mode
npm run test:unit          # compile + fast unit tests (node:test against out/*.js)
npm run test:integration   # compile + real VS Code Extension Development Host smoke test
npm run test                # unit + integration
npm run check                # compile + unit + integration + `vsce ls` packaging dry run
npm run package               # build the .vsix via vsce
```

`npm run check` is what CI runs (`.github/workflows/ci.yml`, matrix over Windows/macOS/Linux) — run
it before submitting changes. There is no separate lint script; `tsc --strict` is the only static
check.

Unit tests `require('../out/<name>.js')`, so they run against **compiled output**, never `src/`
directly. To run a single test file, compile first, then point `node --test` at it:

```bash
npm run compile && node --test test/agents.test.js
```

The integration suite downloads/caches VS Code builds under `.vscode-test/` (gitignored) via
`@vscode/test-electron`, launches a real Extension Development Host, and needs a display on Linux
(CI starts Xvfb for it).

`vscode.window.activeTerminal` only follows `terminal.show()` when the window holds real OS focus.
A headless macOS runner never grants it, and a local desktop can steal it mid-run, so anything
asserting on `activeTerminal` must go behind `detectsActiveTerminalFocus()`, which probes the
environment once at runtime instead of hard-coding a platform. This is not hypothetical: for several
releases the macOS leg failed on exactly this while Windows and Linux passed, and because macOS was
not among the required status checks nobody noticed. Never "fix" a red macOS leg by assuming it is
just flaky — read the log first.

## Architecture

### Module split: pure logic vs. `vscode` glue

This split is why some files under `src/` have unit tests and others don't:

- **No `vscode` import → unit-tested in `test/*.test.js`:** `agents.ts` (agent data model,
  `BUILTIN_AGENTS`, platform-command resolution, merging built-ins with user config), `agent-view.ts`
  (pure view-shaping: grouping/sorting agents and sessions for the sidebar and quick pick),
  `command-utils.ts` (PATH/executable resolution, terminal naming, missing-command detection),
  `doctor.ts` (Agent Doctor version checks via `node:child_process`, with an injectable runner for
  tests).
- **Imports `vscode` → only exercised by `test/integration/`:** `extension.ts` (activation, command
  registration, orchestration), `tree.ts` (sidebar `TreeDataProvider`), `terminal.ts` (terminal
  creation, shell-integration handling), `sessions.ts` (running-session registry), `icons.ts`
  (theme-aware icon resolution).

When adding logic, prefer putting anything that doesn't strictly need the `vscode` API into a pure
module so it's covered by the fast unit suite — the integration suite is comparatively expensive.

`buildAgentGroups` (`agent-view.ts`) is the single source of grouping for **both** the sidebar tree
(group nodes) and the quick pick (separators). It used to be duplicated as a near-identical
`buildAgentSections`, and the two silently drifted; keep the one function and let each surface render
it, so the picker and the tree can't disagree about what belongs where.

Integration tests must not assume an ordering for `vscode.window.terminals`. Asserting on
"the last terminal" is flaky — `superCli.restartSession` deliberately overlaps two terminals, and the
array is not ordered for a test's convenience. Find terminals by name/identity instead, and prefer
`waitForCondition`'s lazy message form to report the actual open terminals when a wait times out.

### `metadata.test.js` guards `package.json`

Many of its assertions are exact `deepEqual` checks against `package.json`'s `contributes` block
(e.g. the full list of contributed command ids, in order). Adding, removing, or reordering a
command, config property, or menu entry almost always requires a matching update to this test, not
just to `package.json`.

### Config security model

`superCli.agents` is `scope: "machine"` and is read with `configuration.inspect('agents').globalValue`
— never the resolved/merged value — so a workspace's `.vscode/settings.json` cannot inject launch
commands (see `getEffectiveAgents` in `extension.ts`). The launcher is also disabled outright whenever
`vscode.workspace.isTrusted` is false. Preserve both when touching config-reading code.

### Command resolution

An agent's `command`/`updateCommand`/`versionCommand` is either a plain string or a
`{windows, macos, linux}` object. `resolveCommandPlatform` (`agents.ts`) maps the host OS plus the
`superCli.useWsl` setting to one of the three variants — WSL always selects `linux`, since the
command runs inside the WSL terminal.

### Terminal content reading is the exception, not the norm

`AgentSessionRegistry` (`sessions.ts`) tracks running agent terminals purely via lifecycle events —
`vscode.window.onDidCloseTerminal` and shell-integration start/end — and never reads terminal
content. That's a deliberate design choice matching the no-telemetry stance in the README's Privacy
section, and future terminal-state work should stay on the same lifecycle-only footing unless that
stance changes deliberately. The one existing exception predates it: `collectShellExecutionOutput` in
`terminal.ts` streams `execution.read()` for the life of the launched command and retains the first
16 KB, solely so `shouldPromptToInstall` can detect a "command not found" failure right after launch.
Treat that as a narrow, bounded, already-reviewed exception, not a precedent for reading more.

The shell-integration path in `executeCommandWithOptionalShellIntegration` (`terminal.ts`) falls back
to `terminal.sendText` after a 3-second timeout when shell integration doesn't attach in time. sendText
itself has no completion signal at all, so callers that must resolve regardless pass the function's
`onFallback` callback and treat "we sent it" as done. `executeCommandWithOptionalShellIntegration` is
exported only so `test/integration/suite/index.js` can force this branch deterministically, by
launching it against a `cmd.exe` terminal — VS Code's own docs confirm cmd.exe doesn't support shell
integration, unlike a real interactive shell where the fallback would be a timing race. It has no
other caller outside `terminal.ts`; don't remove the export as unused without checking that test first.

### Anything awaiting a terminal command must have a non-shell-integration way out

`runAgentUpdate` (`terminal.ts`) resolves on three independent signals: the shell-integration end
event, the `onFallback` path above, and `vscode.window.onDidCloseTerminal`. That third one is not
redundant. Once shell integration attaches, `startExecution` clears the fallback timer, so the *only*
remaining signal is an end event — and a command that never exits (an interactive prompt, a stalled
download) never produces one. Without the close listener the promise stayed pending forever, which is
exactly how `superCli.updateAllAgents` once stranded itself behind a non-cancellable progress
notification (fixed in 1.6.1, regression-tested in the integration suite). Any future code that
`await`s a terminal command needs the same escape hatch, plus a cancellable progress if it loops.
When adding one, verify the test fails without the fix — a test for a hang passes trivially otherwise.

### Renaming or retyping a setting: migrate additively, never clear the old key

`superCli.favoriteAgents` (array) replaced `superCli.favoriteAgent` (single id) this way: the old
key stays declared in `package.json` (marked `markdownDeprecationMessage`, not deleted), a pure
`resolveMigratedFavorites` (`agent-view.ts`) decides whether to seed the new key from the old one,
and `extension.ts` runs that once at activation — but it **never writes `undefined` back to the old
key**. `superCli.*` settings are `scope: "machine"`, so a value written on one machine can propagate
to another via Settings Sync; a machine still running an older version only reads the old key, so
clearing it during migration would look like the favorite silently vanishing there. The cost of
leaving it in place is one stale, harmless entry in `settings.json` behind a deprecation notice.
Apply the same pattern (declare + deprecate + additive migration, never clear) to any future
`superCli.*` setting rename.

### Icon/branding workflow

Adding a built-in agent's icon requires a vendor-sourced static SVG (or an approved project-drawn
fallback, like Kimi's), recorded in `media/agents/ATTRIBUTION.md` and `TRADEMARKS.md`, and it must
pass `metadata.test.js`'s safety checks (no `<script>`, `<foreignObject>`, `href`, or `data:image`).
Read `docs/BRAND.md` before touching Super CLI's *own* logo/interface marks, as opposed to
third-party agent marks.

### TypeScript specifics

`tsconfig.json` uses `NodeNext` modules — relative imports in `src/` need an explicit `.js`
extension (e.g. `from './agents.js'`) even though the source files are `.ts`. `strict` is on.

## Release process

From `CONTRIBUTING.md`: version bumps touch `package.json`, `package-lock.json`, `CHANGELOG.md`, and
`CITATION.cff` together (enforced by a `metadata.test.js` consistency check), followed by
`npm audit` and `npm run check`, then `npm run package` and a manual install-and-verify pass in a
clean Extension Development Host before tagging and publishing.
