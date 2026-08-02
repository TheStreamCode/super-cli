const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const sourceManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const expectedFileName = `${sourceManifest.name}-${sourceManifest.version}.vsix`;
const packagePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(rootDir, expectedFileName);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  if (!fs.existsSync(packagePath)) {
    throw new Error(`VSIX not found: ${packagePath}`);
  }

  // Use the reader that vsce itself uses before publishing a package. Requiring its concrete file
  // keeps the release check available without adding another ZIP dependency to this zero-runtime-dep
  // extension; an upstream layout change fails loudly during packaging instead of skipping validation.
  const { readVSIXPackage } = require(path.join(rootDir, 'node_modules', '@vscode', 'vsce', 'out', 'zip.js'));
  const { manifest, xmlManifest } = await readVSIXPackage(packagePath);
  const identity = xmlManifest?.PackageManifest?.Metadata?.[0]?.Identity?.[0]?.$;

  if (!identity) {
    throw new Error('VSIX identity is missing from extension.vsixmanifest.');
  }

  assertEqual(path.basename(packagePath), expectedFileName, 'VSIX file name');
  assertEqual(manifest.publisher, sourceManifest.publisher, 'extension/package.json publisher');
  assertEqual(manifest.name, sourceManifest.name, 'extension/package.json name');
  assertEqual(manifest.version, sourceManifest.version, 'extension/package.json version');
  assertEqual(identity.Publisher, sourceManifest.publisher, 'extension.vsixmanifest publisher');
  assertEqual(identity.Id, sourceManifest.name, 'extension.vsixmanifest name');
  assertEqual(identity.Version, sourceManifest.version, 'extension.vsixmanifest version');

  const bytes = fs.statSync(packagePath).size;
  console.log(
    `Verified ${path.basename(packagePath)}: ${sourceManifest.publisher}.${sourceManifest.name}`
      + `@${sourceManifest.version}, ${bytes} bytes.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
