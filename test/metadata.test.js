const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BUILTIN_AGENTS } = require('../out/agents.js');

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
  assert.deepEqual(packageJson.activationEvents, [
    'onView:superCli.agents',
    'onCommand:superCli.launch',
    'onCommand:superCli.launchFavorite',
    'onCommand:superCli.manageBuiltins',
    'onCommand:superCli.runDoctor',
    'onCommand:superCli.openSettings',
  ]);
  assert.equal(packageJson.contributes.configuration.title, 'Super CLI');
});

test('release metadata uses one consistent version', () => {
  const packageJson = readPackageJson();
  const packageLock = JSON.parse(readText('package-lock.json'));
  const citation = readText('CITATION.cff');
  const changelog = readText('CHANGELOG.md');

  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.ok(citation.includes(`version: "${packageJson.version}"`));
  assert.ok(changelog.includes(`## [${packageJson.version}]`));
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
    'superCli.openAgentDocumentation',
    'superCli.enableBuiltins',
    'superCli.manageBuiltins',
    'superCli.runDoctor',
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
  assert.equal(packageJson.contributes.viewsWelcome[0].view, 'superCli.agents');
  assert.match(packageJson.contributes.viewsWelcome[0].contents, /superCli\.enableBuiltins/);
});

test('agents setting is machine-scoped and security restricted', () => {
  const packageJson = readPackageJson();
  const properties = packageJson.contributes.configuration.properties;

  assert.equal(properties['superCli.agents'].type, 'array');
  assert.equal(properties['superCli.agents'].scope, 'machine');
  assert.equal(properties['superCli.useBuiltins'].default, true);
  assert.equal(properties['superCli.hiddenBuiltins'].scope, 'machine');
  assert.ok(properties['superCli.hiddenBuiltins'].items.enum.includes('openclaw'));
  assert.equal(properties['superCli.favoriteAgent'].type, 'string');
  assert.equal(properties['superCli.favoriteAgent'].scope, 'machine');
  assert.deepEqual(properties['superCli.agents'].items.required, ['id', 'label', 'command']);
  assert.deepEqual(packageJson.capabilities.untrustedWorkspaces.restrictedConfigurations, ['superCli.agents']);
  assert.match(properties['superCli.agents'].items.properties.id.description, /kimi/);
  assert.match(properties['superCli.useBuiltins'].description, /Kimi Code CLI/);
  assert.ok(packageJson.keywords.includes('kimi'));
  assert.ok(packageJson.keywords.includes('kiro'));
  assert.ok(packageJson.keywords.includes('openclaw'));
});

test('agent settings do not permit automatic CLI installation', () => {
  const properties = readPackageJson().contributes.configuration.properties['superCli.agents'].items.properties;

  assert.equal(Object.hasOwn(properties, 'installCommand'), false);
  assert.equal(Object.hasOwn(properties, 'autoInstall'), false);
  assert.equal(properties.installationDocumentationUrl.type, 'string');
  assert.match(properties.installationDocumentationUrl.description, /official installation documentation/i);
  for (const field of ['command', 'updateCommand', 'versionCommand']) {
    const platformVariant = properties[field].oneOf.find((schema) => schema.type === 'object');
    assert.ok(properties[field].oneOf.some((schema) => schema.type === 'string'), field);
    assert.deepEqual(platformVariant.required, ['windows', 'macos', 'linux'], field);
    assert.equal(platformVariant.additionalProperties, false, field);
  }
});

test('package scripts use deterministic local tooling entry points', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.scripts.compile, 'node ./node_modules/typescript/bin/tsc -p . --pretty false');
  assert.equal(packageJson.scripts.package, 'node ./node_modules/@vscode/vsce/vsce package');
  assert.match(packageJson.scripts.check, /vsce ls$/);
});

test('extension keeps Marketplace, sidebar, and toolbar artwork packaged', () => {
  const marketplaceIcon = readPngSize('media/icon.png');
  const sidebarScreenshot = readPngSize('media/screenshots/sidebar.png');
  const settingsScreenshot = readPngSize('media/screenshots/settings.png');
  const marketplaceSvg = readText('media/icon.svg');
  const sidebarIcon = readText('media/sidebar-mark.svg');
  const toolbarLightIcon = readText('media/toolbar-mark-light.svg');
  const toolbarDarkIcon = readText('media/toolbar-mark-dark.svg');

  assert.ok(marketplaceIcon.width >= 256);
  assert.ok(marketplaceIcon.height >= 256);
  assert.ok(sidebarScreenshot.width >= 1000);
  assert.ok(sidebarScreenshot.height >= 600);
  assert.ok(settingsScreenshot.width >= 1000);
  assert.ok(settingsScreenshot.height >= 600);
  assert.match(marketplaceSvg, /Super CLI Router S/);
  assert.match(marketplaceSvg, /scale\(1\.18\)/);
  for (const toolbarIcon of [toolbarLightIcon, toolbarDarkIcon]) {
    assert.match(toolbarIcon, /<svg/i);
    assert.match(toolbarIcon, /Super CLI Router S/);
    assert.match(toolbarIcon, /viewBox="72 72 368 368"/);
    assert.doesNotMatch(toolbarIcon, /<rect\b|currentColor/);
  }
  assert.match(toolbarLightIcon, /#5f8700/);
  assert.match(toolbarDarkIcon, /#c6ff4a/);
  // The sidebar (activity bar) icon is themed by VS Code, so it must be a currentColor mask.
  assert.match(sidebarIcon, /<svg/i);
  assert.match(sidebarIcon, /Super CLI Router S/);
  assert.match(sidebarIcon, /viewBox="72 72 368 368"/);
  assert.match(sidebarIcon, /currentColor/);
});

test('every built-in has a safe, compact, unique packaged icon', () => {
  const iconPaths = BUILTIN_AGENTS.flatMap((agent) =>
    typeof agent.iconPath === 'string' ? [agent.iconPath] : [agent.iconPath.light, agent.iconPath.dark],
  );

  assert.equal(new Set(iconPaths).size, iconPaths.length);
  for (const iconPath of iconPaths) {
    assert.match(iconPath, /^media\/agents\/[a-z0-9-]+\.svg$/);
    const svg = readText(iconPath);
    assert.match(svg, /<svg\b/i, iconPath);
    assert.match(svg, /viewBox="[^"]+"/, iconPath);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bhref=|data:image/i, iconPath);
  }

  const attribution = readText('media/agents/ATTRIBUTION.md');
  assert.match(attribution, /Vendor-sourced marks/);
  assert.match(attribution, /Project-drawn fallback/);
});

test('documentation uses local images and VSIX packaging uses only .vscodeignore', () => {
  const packageJson = readPackageJson();
  const readme = readText('README.md');
  const contributing = readText('CONTRIBUTING.md');
  const notices = readText('TRADEMARKS.md');
  const vscodeIgnore = readText('.vscodeignore');

  assert.equal(packageJson.files, undefined);
  assert.match(vscodeIgnore, /^\.vscode-test\/\*\*$/m);
  assert.match(vscodeIgnore, /^src\/\*\*$/m);
  assert.doesNotMatch(readme, /!\[[^\]]*\]\(https?:\/\//i);
  assert.match(readme, /!\[[^\]]*\]\(media\/screenshots\/sidebar\.png\)/);
  assert.match(readme, /!\[[^\]]*\]\(media\/screenshots\/settings\.png\)/);
  assert.match(contributing, /npm ci/);
  assert.match(contributing, /media\/agents\/ATTRIBUTION\.md/);
  assert.match(notices, /not affiliated with or endorsed\s+by \[Chutes\]\(https:\/\/chutes\.ai\/\)/i);
  assert.match(notices, /\[Terms of Service\]\(https:\/\/chutes\.ai\/terms\)/);
});

test('package contributes split sidebar and toolbar icons', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].icon, 'media/sidebar-mark.svg');

  const launchCommand = packageJson.contributes.commands.find((command) => command.command === 'superCli.launch');
  assert.equal(launchCommand.icon.light, './media/toolbar-mark-light.svg');
  assert.equal(launchCommand.icon.dark, './media/toolbar-mark-dark.svg');
});

test('CI workflow validates the extension on Windows, macOS, and Linux', () => {
  const workflow = readText('.github/workflows/ci.yml');

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /npm run check/);
});
