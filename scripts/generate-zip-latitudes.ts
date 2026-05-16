/**
 * Generates src/site/zip-latitudes.json from GeoNames postal code data.
 *
 * Data source: https://download.geonames.org/export/zip/ (public domain)
 *
 * Output format: { "10001": 41, "90210": 34, "T2P": 51, ... }
 *   - US: 5-digit zip code → whole-number latitude
 *   - CA: 3-character FSA (Forward Sortation Area) → whole-number latitude
 *
 * Run once and commit the output:
 *   npm run generate-zip-latitudes
 *
 * Re-run if GeoNames data needs refreshing (rarely necessary).
 */
import { unzipSync } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SOURCES = [
  {
    url: 'https://download.geonames.org/export/zip/US.zip',
    filename: 'US.txt',
    keyFn: (postalCode: string) => postalCode.trim(),
    isCA: false,
  },
  {
    url: 'https://download.geonames.org/export/zip/CA.zip',
    filename: 'CA.txt',
    keyFn: (postalCode: string) => postalCode.trim().replace(/\s+/g, '').slice(0, 3).toUpperCase(),
    isCA: true,
  },
];

const OUT_PATH = 'src/site/zip-latitudes.json';

async function downloadZip(url: string): Promise<Uint8Array> {
  console.log(`  Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function parseGeoNames(
  text: string,
  keyFn: (code: string) => string,
): Map<string, number[]> {
  const acc = new Map<string, number[]>();
  for (const line of text.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 10) continue;
    const postalCode = parts[1] ?? '';
    const latStr = parts[9] ?? '';
    if (!postalCode || !latStr) continue;
    const lat = parseFloat(latStr);
    if (isNaN(lat)) continue;
    const key = keyFn(postalCode);
    if (!key) continue;
    const existing = acc.get(key);
    if (existing) {
      existing.push(lat);
    } else {
      acc.set(key, [lat]);
    }
  }
  return acc;
}

async function main() {
  const lookup: Record<string, number> = {};

  for (const source of SOURCES) {
    console.log(`\nProcessing ${source.isCA ? 'Canada' : 'US'}...`);
    const zipData = await downloadZip(source.url);
    const files = unzipSync(zipData);
    const fileData = files[source.filename];
    if (!fileData) {
      throw new Error(`${source.filename} not found in archive`);
    }
    const text = new TextDecoder().decode(fileData);
    const entries = parseGeoNames(text, source.keyFn);

    let count = 0;
    for (const [key, lats] of entries) {
      // Average across all entries for the same key, then round to whole degree
      const avg = lats.reduce((a, b) => a + b, 0) / lats.length;
      lookup[key] = Math.round(avg);
      count++;
    }
    console.log(`  → ${count} unique ${source.isCA ? 'FSA' : 'zip'} entries`);
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(lookup));

  const kb = (JSON.stringify(lookup).length / 1024).toFixed(1);
  console.log(`\n✓ Written to ${OUT_PATH} (${Object.keys(lookup).length} entries, ~${kb}KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
