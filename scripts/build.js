#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src', 'browser');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const BROWSERS = [
  { key: 'chromium', manifest: 'manifest.chromium.json', archiveExt: 'zip', packageable: true },
  { key: 'gecko', manifest: 'manifest.gecko.json', archiveExt: 'xpi', packageable: true },
  { key: 'safari', manifest: 'manifest.safari.json', archiveExt: null, packageable: false }
];
const MANIFEST_FILES = BROWSERS.map((browser) => browser.manifest);
const DEFAULT_LOCALE = 'en';

async function main() {
  try {
    const options = parseCli(process.argv.slice(2));
    await fs.mkdir(DIST_DIR, { recursive: true });

    const results = [];
    for (const key of options.browsers) {
      const browser = BROWSERS.find((item) => item.key === key);
      results.push(await buildBrowser(browser, { skipArchive: options.skipZip }));
    }

    console.log('\nBuild artifacts');
    for (const result of results) {
      console.log(`  • ${result.browser}: ${path.relative(ROOT_DIR, result.directory)}`);
      if (result.archivePath) {
        console.log(`    ↳ package: ${path.relative(ROOT_DIR, result.archivePath)}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function parseCli(argv) {
  const output = { browsers: BROWSERS.map((browser) => browser.key), skipZip: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser' || arg === '-b') {
      const list = argv[index + 1];
      if (!list) {
        throw new Error('Missing value for --browser flag');
      }
      output.browsers = list.split(',').map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (arg.startsWith('--browser=')) {
      const list = arg.replace('--browser=', '');
      output.browsers = list.split(',').map((value) => value.trim()).filter(Boolean);
    } else if (arg === '--no-zip') {
      output.skipZip = true;
    }
  }

  output.browsers = [...new Set(output.browsers)];
  const invalid = output.browsers.filter((value) => !BROWSERS.some((browser) => browser.key === value));
  if (invalid.length) {
    throw new Error(`Unknown browser target(s): ${invalid.join(', ')}`);
  }

  return output;
}

async function buildBrowser(browser, options) {
  console.log(`Building ${browser.key} bundle...`);
  const browserDistDir = path.join(DIST_DIR, browser.key);
  await fs.rm(browserDistDir, { recursive: true, force: true });
  await fs.cp(SRC_DIR, browserDistDir, { recursive: true });

  for (const manifest of MANIFEST_FILES) {
    const manifestPath = path.join(browserDistDir, manifest);
    if (manifest === browser.manifest) {
      await fs.rename(manifestPath, path.join(browserDistDir, 'manifest.json'));
    } else {
      await fs.rm(manifestPath, { force: true });
    }
  }

  await generateLocaleMessages(browserDistDir);

  const manifestPath = path.join(browserDistDir, 'manifest.json');
  const manifestContent = await fs.readFile(manifestPath, 'utf8');
  const manifestData = JSON.parse(manifestContent);
  const resolvedName = await resolveManifestText(manifestData.name, browserDistDir);
  const placeholderMatcher = /^__MSG_.+__$/;
  const safeNameSource = !placeholderMatcher.test(resolvedName || '')
    ? resolvedName
    : !placeholderMatcher.test(manifestData.name || '')
    ? manifestData.name
    : 'redirecttube';
  const safeName = safeNameSource.replace(/\s+/g, '_');
  const archiveBaseName = `${safeName}-${manifestData.version}-${browser.key}-unsigned`;

  let archivePath = null;
  if (!options.skipArchive && browser.packageable !== false) {
    const packagesDir = path.join(DIST_DIR, 'packages');
    await fs.mkdir(packagesDir, { recursive: true });
    archivePath = path.join(packagesDir, `${archiveBaseName}.${browser.archiveExt}`);
    await fs.rm(archivePath, { force: true });
    runZip(browserDistDir, archivePath);
  }

  return { browser: browser.key, directory: browserDistDir, archivePath };
}

function runZip(sourceDir, outputFile) {
  const result = spawnSync('zip', ['-qr', outputFile, '.'], {
    cwd: sourceDir,
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Failed to start zip command: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error('zip command failed');
  }
}

async function generateLocaleMessages(browserDir) {
  const localesSourceDir = path.join(browserDir, 'i18n', 'locales');
  let localeEntries;
  try {
    localeEntries = await fs.readdir(localesSourceDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const localesTargetDir = path.join(browserDir, '_locales');
  await fs.rm(localesTargetDir, { recursive: true, force: true });
  await fs.mkdir(localesTargetDir, { recursive: true });

  for (const entry of localeEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const localeCode = entry.name.replace(/\.json$/i, '');
    const localePath = path.join(localesSourceDir, entry.name);
    const localeContent = await fs.readFile(localePath, 'utf8');
    const localeData = JSON.parse(localeContent);
    const flattened = flattenLocaleObject(localeData);
    const messages = {};

    for (const [key, value] of Object.entries(flattened)) {
      if (typeof value !== 'string') {
        continue;
      }
      const messageName = toMessageName(key);
      if (!messageName) {
        continue;
      }
      messages[messageName] = { message: value };
    }

    if (!Object.keys(messages).length) {
      continue;
    }

    const targetLocaleDir = path.join(localesTargetDir, localeCode);
    await fs.mkdir(targetLocaleDir, { recursive: true });
    await fs.writeFile(
      path.join(targetLocaleDir, 'messages.json'),
      `${JSON.stringify(messages, null, 2)}\n`
    );
  }
}

function flattenLocaleObject(input, prefix = '') {
  if (!input || typeof input !== 'object') {
    return prefix && typeof input === 'string' ? { [prefix]: input } : {};
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      output[nextPrefix] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(output, flattenLocaleObject(value, nextPrefix));
    }
  }
  return output;
}

function toMessageName(key) {
  if (!key) {
    return '';
  }
  return key
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9_]/g, '_');
}

async function resolveManifestText(value, browserDir) {
  if (typeof value !== 'string') {
    return value;
  }
  const match = value.match(/^__MSG_(.+)__$/);
  if (!match) {
    return value;
  }

  const messagesPath = path.join(
    browserDir,
    '_locales',
    DEFAULT_LOCALE,
    'messages.json'
  );

  try {
    const content = await fs.readFile(messagesPath, 'utf8');
    const messages = JSON.parse(content);
    const key = match[1];
    return (messages[key] && messages[key].message) || value;
  } catch (error) {
    return value;
  }
}

main();
