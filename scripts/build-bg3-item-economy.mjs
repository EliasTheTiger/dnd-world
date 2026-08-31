import {execFileSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const STANDARD_ECONOMY_BUILDER = join(SCRIPT_DIR, 'audit-bg3-v10-economy.mjs');

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseGoldValues(xml) {
  const rows = [];
  for (const match of String(xml).matchAll(/<stat_object\b[^>]*>([\s\S]*?)<\/stat_object>/g)) {
    const fields = {};
    for (const field of match[1].matchAll(/<field\s+name="([^"]+)"[^>]*\svalue="([^"]*)"[^>]*\/>/g)) {
      fields[field[1]] = decodeXml(field[2]);
    }
    if (!fields.UUID) continue;
    const levels = {};
    for (const [key, value] of Object.entries(fields)) {
      const level = /^Level(\d+)$/.exec(key);
      if (level) levels[level[1]] = Number(value);
    }
    rows.push({
      uuid: fields.UUID.toLowerCase(),
      name: fields.Name || '',
      using: fields.Using ? fields.Using.toLowerCase() : null,
      parentScale: fields.ParentScale == null ? 1 : Number(fields.ParentScale),
      levels,
    });
  }
  rows.sort((a, b) => a.uuid.localeCompare(b.uuid));
  if (!rows.length) throw new Error('GoldValues.tbl contained no stat objects');
  return rows;
}

export function roundHalfUp(value, step = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0 || value < 0) {
    throw new Error(`Invalid non-negative rounding input: ${value}, step ${step}`);
  }
  return Math.floor(value / step + 0.5) * step;
}

function goldMap(rows) {
  return new Map(rows.map(row => [row.uuid, row]));
}

export function resolveGoldValue(rowsOrMap, uuid, level, seen = new Set()) {
  const rows = rowsOrMap instanceof Map ? rowsOrMap : goldMap(rowsOrMap);
  const key = String(uuid || '').toLowerCase();
  const numericLevel = Number(level);
  const row = rows.get(key);
  if (!row || !Number.isInteger(numericLevel) || numericLevel < 1) return null;
  const exact = row.levels[String(numericLevel)];
  if (Number.isFinite(exact)) return exact;
  if (seen.has(key)) throw new Error(`GoldValues inheritance cycle at ${key}`);
  const nextSeen = new Set(seen).add(key);
  if (row.using) {
    const parent = resolveGoldValue(rows, row.using, numericLevel, nextSeen);
    return parent == null ? null : roundHalfUp(parent * row.parentScale);
  }
  const defined = Object.values(row.levels).filter(Number.isFinite);
  if (defined.length === 1) return roundHalfUp(defined[0] * row.parentScale);
  return null;
}

export function calculateBg3Price(bg3, rowsOrMap) {
  if (!bg3 || typeof bg3 !== 'object') return null;
  if (bg3.override !== null && bg3.override !== undefined && bg3.override !== '') {
    const price = Number(bg3.override);
    return Number.isFinite(price) && price >= 0
      ? {gp: roundHalfUp(price), method: 'value-override', raw: price}
      : null;
  }
  const level = Number(bg3.level);
  const scale = Number(bg3.scale);
  const base = resolveGoldValue(rowsOrMap, bg3.valueUUID, level);
  if (!Number.isFinite(base) || !Number.isFinite(scale) || scale < 0) return null;
  const raw = base * scale;
  const rounded = Number(bg3.rounding)
    ? roundHalfUp(raw, raw >= 1000 ? 50 : raw >= 100 ? 10 : raw >= 20 ? 5 : 1)
    : roundHalfUp(raw);
  return {gp: rounded, method: 'gold-value-curve', raw, base, level, scale};
}

function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) {
    throw new Error('Usage: node scripts/build-bg3-item-economy.mjs --write|--check');
  }
  execFileSync(process.execPath, [STANDARD_ECONOMY_BUILDER, mode], {cwd: REPO_ROOT, stdio: 'inherit'});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
