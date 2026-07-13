const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const PNG_SIGNATURE_SIZE = 8;

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readPackageJson() {
  return JSON.parse(readText('package.json'));
}

function readPngSize(relativePath) {
  const fileBuffer = fs.readFileSync(path.join(rootDir, relativePath));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert.deepEqual(fileBuffer.subarray(0, PNG_SIGNATURE_SIZE), pngSignature);

  return {
    width: fileBuffer.readUInt32BE(16),
    height: fileBuffer.readUInt32BE(20),
  };
}

test('package metadata uses Super CLI branding', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.name, 'vscode-super-cli');
  assert.match(packageJson.displayName, /^Super CLI/);
  assert.equal(packageJson.publisher, 'mikesoft');
  assert.equal(packageJson.icon, 'media/icon.png');
  assert.equal(packageJson.main, './out/extension.js');
  assert.deepEqual(packageJson.activationEvents, ['onStartupFinished']);
  assert.equal(packageJson.contributes.configuration.title, 'Super CLI');
});

test('package declares the launcher commands', () => {
  const packageJson = readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);

  assert.deepEqual(commands, [
    'superCli.launch',
    'superCli.launchAgent',
    'superCli.launchFavorite',
    'superCli.setFavorite',
    'superCli.unsetFavorite',
    'superCli.updateAgent',
    'superCli.refresh',
    'superCli.openSettings',
  ]);
});

test('package binds Launch Favorite Agent to Ctrl+Alt+A', () => {
  const packageJson = readPackageJson();
  const binding = packageJson.contributes.keybindings.find(
    (entry) => entry.command === 'superCli.launchFavorite',
  );

  assert.ok(binding);
  assert.equal(binding.key, 'ctrl+alt+a');
  assert.equal(binding.mac, 'cmd+alt+a');
});

test('package contributes the sidebar view and agents tree', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].id, 'superCli');
  assert.equal(packageJson.contributes.views.superCli[0].id, 'superCli.agents');
});

test('agents setting is machine-scoped and security restricted', () => {
  const packageJson = readPackageJson();
  const properties = packageJson.contributes.configuration.properties;

  assert.equal(properties['superCli.agents'].type, 'array');
  assert.equal(properties['superCli.agents'].scope, 'machine');
  assert.equal(properties['superCli.useBuiltins'].default, true);
  assert.equal(properties['superCli.favoriteAgent'].type, 'string');
  assert.equal(properties['superCli.favoriteAgent'].scope, 'machine');
  assert.deepEqual(properties['superCli.agents'].items.required, ['id', 'label', 'command']);
  assert.deepEqual(packageJson.capabilities.untrustedWorkspaces.restrictedConfigurations, ['superCli.agents']);
});

test('agent settings do not permit automatic CLI installation', () => {
  const properties = readPackageJson().contributes.configuration.properties['superCli.agents'].items.properties;

  assert.equal(Object.hasOwn(properties, 'installCommand'), false);
  assert.equal(Object.hasOwn(properties, 'autoInstall'), false);
  assert.equal(properties.installationDocumentationUrl.type, 'string');
  assert.match(properties.installationDocumentationUrl.description, /official installation documentation/i);
});

test('package scripts use deterministic local tooling entry points', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.scripts.compile, 'node ./node_modules/typescript/bin/tsc -p . --pretty false');
  assert.equal(packageJson.scripts.package, 'node ./node_modules/@vscode/vsce/vsce package');
  assert.match(packageJson.scripts.check, /vsce ls$/);
});

test('extension keeps Marketplace, sidebar, and toolbar artwork packaged', () => {
  const marketplaceIcon = readPngSize('media/icon.png');
  const sidebarIcon = readText('media/sidebar-mark.svg');
  const toolbarIcon = readText('media/toolbar-mark.svg');

  assert.ok(marketplaceIcon.width >= 256);
  assert.ok(marketplaceIcon.height >= 256);
  assert.match(toolbarIcon, /<svg/i);
  // The sidebar (activity bar) icon is themed by VS Code, so it must be a currentColor mask.
  assert.match(sidebarIcon, /<svg/i);
  assert.match(sidebarIcon, /currentColor/);
});

test('documentation uses local images and VSIX packaging uses only .vscodeignore', () => {
  const packageJson = readPackageJson();
  const readme = readText('README.md');
  const notices = readText('TRADEMARKS.md');
  const vscodeIgnore = readText('.vscodeignore');

  assert.equal(packageJson.files, undefined);
  assert.match(vscodeIgnore, /^\.vscode-test\/\*\*$/m);
  assert.match(vscodeIgnore, /^src\/\*\*$/m);
  assert.doesNotMatch(readme, /!\[[^\]]*\]\(https?:\/\//i);
  assert.match(readme, /!\[[^\]]*\]\(media\/screenshots\/sidebar\.png\)/);
  assert.match(readme, /!\[[^\]]*\]\(media\/screenshots\/settings\.png\)/);
  assert.match(notices, /not affiliated with or endorsed\s+by \[Chutes\]\(https:\/\/chutes\.ai\/\)/i);
  assert.match(notices, /\[Terms of Service\]\(https:\/\/chutes\.ai\/terms\)/);
});

test('package contributes split sidebar and toolbar icons', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].icon, 'media/sidebar-mark.svg');

  const launchCommand = packageJson.contributes.commands.find((command) => command.command === 'superCli.launch');
  assert.equal(launchCommand.icon.light, './media/toolbar-mark.svg');
  assert.equal(launchCommand.icon.dark, './media/toolbar-mark.svg');
});

test('CI workflow validates the extension on Windows and Linux', () => {
  const workflow = readText('.github/workflows/ci.yml');

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /npm run check/);
});
