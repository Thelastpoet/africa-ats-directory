import * as fs from 'fs';
import * as path from 'path';

const PLATFORMS = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'bamboohr',
  'breezyhr',
  'recruitee',
] as const;

const companiesDir = process.env.COMPANIES_DIR
  ? path.resolve(process.env.COMPANIES_DIR)
  : path.join(__dirname, '../companies');
const outputPath = path.join(companiesDir, 'index.json');

type Platform = (typeof PLATFORMS)[number];

interface CompanyEntry {
  id: string;
  company: string;
  ats: Platform;
  country: string;
  city?: string;
  sector?: string;
  sector_raw?: string;
  status?: 'active' | 'inactive' | 'unknown' | 'watchlist';
  careers_url: string;
  board_url: string;
  platform_metadata: Record<string, string>;
  verification: {
    method: 'auto-detected' | 'manual';
    confidence: number;
    first_seen_at: string;
    last_checked_at: string;
    last_status_code: number;
  };
  evidence: {
    detected_from_url: string;
    resolved_board_url: string;
    detection_signals: string[];
    notes?: string;
  };
  source?: {
    submitted_by: string;
    submitted_at: string;
  };
}

interface IndexPayload {
  generated_at: string;
  total_entries: number;
  entries: CompanyEntry[];
}

function deriveGeneratedAt(entries: CompanyEntry[]): string {
  const validDates = entries
    .map((entry) => entry.verification?.last_checked_at)
    .filter((value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  // Keep index deterministic: only change when source data changes.
  return validDates.length > 0 ? `${validDates[validDates.length - 1]}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z';
}

const all: CompanyEntry[] = [];

for (const platform of PLATFORMS) {
  const filePath = path.join(companiesDir, `${platform}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required platform file: ${platform}.json`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${platform}.json must contain a JSON array`);
  }

  all.push(...(parsed as CompanyEntry[]));
}

all.sort((a, b) => {
  if (a.country !== b.country) return a.country.localeCompare(b.country);
  if (a.company !== b.company) return a.company.localeCompare(b.company);
  return a.id.localeCompare(b.id);
});

const payload: IndexPayload = {
  generated_at: deriveGeneratedAt(all),
  total_entries: all.length,
  entries: all,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

const byAts: Record<string, number> = {};
const byCountry: Record<string, number> = {};

for (const entry of all) {
  byAts[entry.ats] = (byAts[entry.ats] ?? 0) + 1;
  byCountry[entry.country] = (byCountry[entry.country] ?? 0) + 1;
}

console.log(`Built companies/index.json with ${payload.total_entries} entries`);
console.log(`Generated at: ${payload.generated_at}`);
console.log('By ATS:');
for (const [ats, count] of Object.entries(byAts).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${ats.padEnd(18)} ${count}`);
}
console.log('By Country:');
for (const [country, count] of Object.entries(byCountry).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${country}  ${count}`);
}
