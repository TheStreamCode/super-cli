# Contributing

Thanks for your interest in improving Super CLI.

## Development

```bash
npm ci
npm run check
```

Keep changes focused and covered by tests. Third-party marks must come from an authoritative public
source, remain limited to product identification, and be recorded in
[`media/agents/ATTRIBUTION.md`](media/agents/ATTRIBUTION.md) and [`TRADEMARKS.md`](TRADEMARKS.md).
Package only static, safe SVGs without scripts, embedded images, or external references.

## Pull Requests

- Keep user-facing behavior documented in `README.md`.
- Add or update tests for launcher behavior, agent presets, and package metadata.
- Run `npm run check` before submitting changes.

## Release checklist

1. Choose the next semantic version and update `package.json`, `package-lock.json`, `CHANGELOG.md`,
   and `CITATION.cff` together.
2. Run `npm ci`, `npm audit`, and `npm run check`.
3. Run `npm run package` and inspect the file list reported by `vsce`.
4. Install the generated VSIX in a clean Extension Development Host and verify the sidebar, launcher,
   settings, toolbar icon, and one terminal launch.
5. Commit and push the reviewed files, then create the matching `v<version>` tag and publish the same
   VSIX to the intended registries.
