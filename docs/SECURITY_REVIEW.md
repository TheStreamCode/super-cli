# Security Best-Practices Review

Date: 2026-08-01
Scope: Super CLI 1.9.2 source, tests, package metadata, dependency tree, VSIX contents, and GitHub
automation.

## Executive summary

No critical or high-severity vulnerability was found. The extension has a deliberately small attack
surface: zero runtime npm dependencies, no telemetry, no automatic installers, user-global command
configuration, and Workspace Trust gates before commands run.

This review resolved one moderate supply-chain gap and three low-severity hardening or availability
issues. The complete local CI-equivalent gate passes, the dependency audit reports no known
vulnerabilities, all installed packages have verified registry signatures, and the current default
branch CodeQL analysis reports no findings.

## Critical severity

None found.

## High severity

None found.

## Moderate severity

### SBR-001 — Development install scripts lacked a reviewed policy

Status: resolved.

The development tree includes packages with lifecycle scripts. Without a repository policy, future
npm versions would either keep warning or eventually block them, and reviewers had no durable record
of the exact versions whose scripts had been inspected. The reviewed packages are now approved by
exact version in `package.json` (`package.json:570`), while weekly npm and GitHub Actions updates are
configured in `.github/dependabot.yml` (`.github/dependabot.yml:1`). CI runs the explicit audit script
on Linux (`.github/workflows/ci.yml:58`).

## Low severity

### SBR-002 — External documentation accepted arbitrary URI schemes

Status: resolved.

Custom configuration or a crafted command argument could previously reach the operating system's
external URI handler with a non-HTTPS scheme or embedded credentials. Documentation links are now
normalized to credential-free HTTPS URLs (`src/agents.ts:508`), sanitized during configuration
merging (`src/agents.ts:620`), and validated again at both external-open call paths
(`src/extension.ts:290`, `src/terminal.ts:141`). The configuration schema also rejects unknown agent
properties and non-HTTPS documentation URLs (`package.json:352`, `package.json:398`).

### SBR-003 — One Agent Doctor runner rejection aborted the report

Status: resolved.

A version-command runner that failed before returning a result could reject the complete concurrent
inspection. The affected agent is now reported as `check-failed` without exposing the raw error, and
the remaining checks continue (`src/doctor.ts:97`).

### SBR-004 — Local secret and build files were not all excluded from VSIX packaging

Status: resolved.

The Git ignore rules did not protect `.env` variants, and `.vscodeignore` did not explicitly exclude
environment files, logs, coverage output, or previously generated VSIX files. Both boundaries now
exclude those classes (`.gitignore:6`, `.vscodeignore:9`). The final package file list contains only
runtime code, product metadata, documentation required by the Marketplace, and existing media.

## Informational observations

- Launch and update commands remain shell strings by design. The extension reads agent definitions
  only from user-global configuration and refuses to run them before Workspace Trust is granted.
- Agent Doctor commands are explicit, bounded to five seconds and 4 KB, run with concurrency three,
  and produce a report without commands, raw output, environment values, or credentials.
- Session tracking is lifecycle-based. The only terminal-output read remains the bounded 16 KB
  missing-command detector documented in `AGENTS.md`.
- The two npm deprecation notices come through the current `@vscode/vsce` development dependency
  (`whatwg-encoding` and optional `keytar`/`prebuild-install`). They are not runtime dependencies and
  have no current audit advisory; replacement depends on the upstream packaging tool.

## Verification evidence

- `npm run typecheck`: passed.
- `npm run check`: passed; 112 unit tests, real VS Code Extension Development Host integration suite,
  and `vsce ls` packaging dry run.
- `npm run audit`: 0 vulnerabilities.
- `npm audit signatures`: 317 packages with verified registry signatures; 17 with verified
  attestations.
- Review VSIX: 87 files, 663.63 KB; no source, tests, source maps, `.env`, logs, coverage, or nested
  VSIX files.
- GitHub default setup CodeQL on the reviewed baseline: 0 results across 87 rules.

## Residual follow-up

The updated `actions/setup-node` reference and new Dependabot configuration require a pushed branch
before GitHub can execute or ingest them. No publish, tag, release, or remote repository mutation was
performed during this review.
