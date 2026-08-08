# Security Best-Practices Review

Date: 2026-08-08
Scope: Super CLI 1.11.1 source, tests, package metadata, dependency tree, VSIX contents, and GitHub
automation.

## Executive summary

No critical or high-severity vulnerability remains in the shipped extension. Super CLI keeps zero
runtime npm dependencies, refuses launches in untrusted workspaces, reads executable agent definitions
only from user-global configuration, performs no automatic installation, and has no telemetry.

This audit found and resolved four high-severity advisories in the development-only VSIX toolchain,
one low-severity command-boundary weakness, and one correctness defect in the CodeBuddy preset. The
complete CI-equivalent gate, real VS Code integration suite, dependency audit, package build, and VSIX
identity verification all pass.

## Critical severity

None found.

## High severity

### SBR-006 — Vulnerable transitive packages in the development toolchain

Status: resolved.

Impact: a vulnerable parser or HTTP component in packaging and test tooling could affect maintainers
or CI processing malicious input, although none of these packages ships as an extension runtime
dependency.

`@vscode/vsce` transitively resolved vulnerable versions of `brace-expansion`, `fast-uri`, `js-yaml`,
and `undici`. The authoritative lockfile now selects patched versions 5.0.9, 3.1.5, 4.3.1, and 7.29.0
respectively (`package-lock.json:1334`, `package-lock.json:1991`, `package-lock.json:2571`,
`package-lock.json:4402`). No direct dependency range or runtime dependency was added. Related npm
security updates are grouped so Dependabot can satisfy the repository-wide audit gate in one pull
request (`.github/dependabot.yml:13`).

## Moderate severity

None open.

### SBR-001 — Development install scripts lacked a reviewed policy

Status: resolved in 1.9.3.

Install scripts used by the development tree remain approved by exact package version
(`package.json:572`), while CI runs the explicit audit gate.

## Low severity

### SBR-007 — Registered command handlers trusted caller-supplied agent and session objects

Status: resolved.

VS Code commands may be invoked programmatically with arguments. Several handlers previously accepted
complete `Agent` objects, so a caller able to invoke a Super CLI command could replace the command,
environment, update command, label, or documentation URL while reusing a legitimate-looking object.
Stop and restart similarly accepted any structurally valid session object.

Agent arguments now resolve by id to the canonical effective user-global configuration
(`src/agents.ts:56`, `src/extension.ts:70`). Unknown agent ids are rejected. Stop and restart resolve
only to sessions owned by the current extension host, matching by registry id or terminal identity
(`src/sessions.ts:44`, `src/extension.ts:557`). Restart consequently uses the tracked session's agent
and cwd, not caller-supplied fields. Reveal remains a narrow terminal `show()` forwarder and preserves
its deterministic, focus-independent integration test.

Regression coverage verifies canonical resolution, rejects unknown agents and untracked sessions, and
injects spoofed command, update, environment, and label fields while confirming that only the configured
agent launches (`test/agents.test.js:34`, `test/integration/suite/index.js:149`).

### SBR-002 — External documentation accepted arbitrary URI schemes

Status: resolved in 1.9.3.

Documentation URLs are normalized to credential-free HTTPS both while agent configuration is resolved
and immediately before an external open. The configuration schema rejects unknown agent properties.

### SBR-003 — One Agent Doctor runner rejection aborted the report

Status: resolved in 1.9.3.

Each failed version check is isolated and reported as `check-failed` without commands, raw output,
environment values, or credentials leaking into the report.

### SBR-004 — Local secret and build files were not all excluded from VSIX packaging

Status: resolved in 1.9.3.

Git and VSIX packaging boundaries exclude environment files, logs, coverage, generated VSIX files,
source, tests, and source maps.

### SBR-005 — Terminal-command listeners accumulated and could target a disposed terminal

Status: resolved in 1.9.4.

Per-invocation listeners and timers are released when a command settles or its terminal closes. Output
capture remains an explicit 16 KB opt-in used only by the launch-time missing-command detector.

## Correctness finding

The CodeBuddy preset used `codebuddy upgrade`, while the current vendor CLI reference documents
`codebuddy update`. The preset and its exact cross-platform tests now use the documented command
(`src/agents.ts:495`, `test/agents.test.js:301`).

## Informational observations

- Launch and update commands remain shell strings by design, but originate only from trusted effective
  configuration and are blocked until Workspace Trust is granted.
- Session tracking remains lifecycle-only. The single bounded output-read exception is unchanged and
  remains limited to post-launch missing-command detection.
- `@types/vscode` stays pinned to the `engines.vscode` 1.93 API floor, and Node type updates remain in
  the supported Node 22 line.
- The VS Code 1.132 Extension Development Host emits upstream experimental/deprecation noise during
  integration startup; the suite itself exits successfully.

## Verification evidence

- `npm run check`: passed; 117 unit tests, real VS Code Extension Development Host integration suite,
  and `vsce ls` packaging dry run.
- `npm run audit`: passed with 0 vulnerabilities.
- `npm run package`: passed; 92 files, 1.15 MB.
- `scripts/verify-vsix.js`: passed for `mikesoft.vscode-super-cli@1.11.1`, 1,207,751 bytes.
- The package contains no runtime dependencies and no source, tests, source maps, `.env`, logs,
  coverage, or nested VSIX files.
- `npm audit signatures`: 317 verified registry signatures and 17 verified attestations after the
  clean install gate.

## Residual follow-up

The reviewed GitHub artifact is version 1.11.1. Marketplace and Open VSX publication remain separate,
credentialed release operations and are not performed as part of this GitHub release.
