#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const domainModel = require('./item-domain-model.js');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

function argumentsOf(argv) {
  const options = {output: null};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output') options.output = String(argv[++index] || '');
    else if (argument === '--check') continue;
    else if (argument === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function catalogLocation() {
  const pointerPath = path.join(repositoryRoot, 'data', 'bg3', 'current.json');
  const pointerBytes = fs.readFileSync(pointerPath);
  const pointer = JSON.parse(pointerBytes.toString('utf8'));
  const catalogRoot = path.join(repositoryRoot, 'data', 'bg3', pointer.catalogVersion);
  return {pointer, pointerPath, pointerSha256: sha256(pointerBytes), catalogRoot};
}

function sourceItems(catalogRoot) {
  const itemRoot = path.join(catalogRoot, 'items');
  const files = fs.readdirSync(itemRoot).filter(file => file.endsWith('.json')).sort();
  const hashes = [];
  const items = [];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(itemRoot, file));
    const payload = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(payload.items)) throw new Error(`${file}: items must be an array`);
    hashes.push({path: `items/${file}`, sha256: sha256(bytes)});
    items.push(...payload.items);
  }
  return {items, hashes};
}

function migrateStandard(items) {
  const materialized = items.filter(item => JSON.stringify(item.source?.profiles) === '["standard"]');
  const context = domainModel.createMigrationContext(materialized);
  const domains = materialized.map(item => domainModel.migrateItemToDomainV7(item, {context}));
  const errors = domainModel.validateDomainCatalog(domains);
  if (errors.length) throw new Error(`standard: ${errors.length} validation error(s)\n${errors.slice(0, 20).join('\n')}`);
  const rerun = domains.map(item => domainModel.migrateItemToDomainV7(item, {context}));
  if (JSON.stringify(rerun) !== JSON.stringify(domains)) throw new Error('standard: migration is not idempotent');
  return {count: domains.length, actions: domains.reduce((sum, item) => sum + item.gameplay.actions.length, 0),
    blockedCapabilities: domains.reduce((sum, item) => sum + item.provenance.blockedCapabilities.length, 0), items: domains};
}

function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function writeAtomic(outputPath, payload, protectedRoot) {
  const resolved = path.resolve(repositoryRoot, outputPath);
  if (inside(resolved, protectedRoot)) throw new Error('Refusing to write generated output inside the immutable source catalog');
  fs.mkdirSync(path.dirname(resolved), {recursive: true});
  const temporary = `${resolved}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload)}\n`, {encoding: 'utf8', flag: 'wx'});
    fs.renameSync(temporary, resolved);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
  return resolved;
}

function main() {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/migrate-item-domain-v7.mjs [--check] [--output FILE]');
    return;
  }
  const location = catalogLocation();
  const source = sourceItems(location.catalogRoot);
  const migrated = {standard: migrateStandard(source.items)};
  const payload = {
    schemaVersion: 'dnd-world-item-domain-catalog/1',
    itemSchemaVersion: domainModel.SCHEMA_VERSION,
    source: {catalogVersion: location.pointer.catalogVersion, currentSha256: location.pointerSha256, itemShards: source.hashes},
    profiles: migrated,
  };
  const report = {schemaVersion: payload.schemaVersion, itemSchemaVersion: payload.itemSchemaVersion, catalogVersion: payload.source.catalogVersion,
    profiles: Object.fromEntries(Object.entries(migrated).map(([profile, value]) => [profile, {count: value.count, actions: value.actions, blockedCapabilities: value.blockedCapabilities}]))};
  if (options.output) report.output = writeAtomic(options.output, payload, location.catalogRoot);
  console.log(JSON.stringify(report, null, 2));
}

main();
