# Contributing

Thanks for your interest in improving Super CLI.

## Getting started

1. **Fork** the repository and clone your fork locally.
2. Install dependencies:

   `ash
   npm ci
   `

3. Create a branch from `main` with a descriptive name:

   `ash
   git checkout -b fix/agent-detection-wsl
   git checkout -b feat/custom-agent-icons
   `

4. Make your changes, then verify everything passes:

   `ash
   npm run check    # compile + unit tests + VS Code integration smoke test
   `

5. Commit with a clear message, push to your fork, and open a **Pull Request**
   against `main`. Fill in the PR template completely.

## Before opening an issue

- **Search existing issues** — your problem may already be reported.
- Use the **Bug report** or **Feature request** template.
- For questions ("how do I…?", "does it work with…?"), open a
  [Discussion](https://github.com/TheStreamCode/super-cli/discussions) instead
  of an issue.

## Code style

- TypeScript strict mode — no `any` unless justified.
- Follow the existing patterns in `src/`; consistency matters more than
  personal preference.
- Keep user-facing behavior documented in `README.md`.
- Third-party marks must come from an authoritative public source, remain
  limited to product identification, and be recorded in
  [`media/agents/ATTRIBUTION.md`](media/agents/ATTRIBUTION.md) and
  [`TRADEMARKS.md`](TRADEMARKS.md).
- Package only static, safe SVGs without scripts, embedded images, or external
  references. See [`docs/BRAND.md`](docs/BRAND.md) before changing Super
  CLI's own logo or interface marks.

## Pull requests

- Link the related issue (`Fixes #123`) when applicable.
- Add or update tests for launcher behavior, agent presets, and package
  metadata.
- Include screenshots or a short recording for any UI-visible change.
- Run `npm run check` before submitting.
- Keep PRs focused — one concern per PR is easier to review and merge.

## Release checklist (maintainers)

1. Choose the next semantic version and update `package.json`,
   `package-lock.json`, `CHANGELOG.md`, and `CITATION.cff` together.
2. Run `npm ci`, `npm audit`, and `npm run check`.
3. Run `npm run package` and inspect the file list reported by `vsce`.
4. Install the generated VSIX in a clean Extension Development Host and verify
   the sidebar, launcher, settings, toolbar icon, and one terminal launch.
5. Commit and push the reviewed files, then create the matching `v<version>`
   tag and publish the same VSIX to the intended registries.