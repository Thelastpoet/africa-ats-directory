import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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

type Platform = (typeof PLATFORMS)[number];

const ATS_HOST_PATTERNS: RegExp[] = [
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)grnh\.se$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)workable\.com$/i,
  /(^|\.)bamboohr\.com$/i,
  /(^|\.)breezy\.hr$/i,
  /(^|\.)recruitee\.com$/i,
];

const PLATFORM_METADATA_KEY: Record<Platform, string> = {
  greenhouse: 'board_token',
  lever: 'board_token',
  ashby: 'board_token',
  smartrecruiters: 'org_slug',
  workable: 'account_slug',
  bamboohr: 'subdomain',
  breezyhr: 'subdomain',
  recruitee: 'subdomain',
};

const schemaPath = process.env.SCHEMA_PATH
  ? path.resolve(process.env.SCHEMA_PATH)
  : path.join(__dirname, '../schema/company-entry.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const companiesDir = process.env.COMPANIES_DIR
  ? path.resolve(process.env.COMPANIES_DIR)
  : path.join(__dirname, '../companies');
const SKIP_BOARD_PROBES = process.env.SKIP_BOARD_PROBES === '1';

interface CompanyEntry {
  id: string;
  ats: Platform;
  board_url: string;
  platform_metadata: Record<string, unknown>;
  status?: 'active' | 'inactive' | 'unknown' | 'watchlist';
}

interface ValidationTarget {
  platform: Platform;
  fileName: string;
  entry: CompanyEntry;
}

interface ProbeResult {
  kind: 'pass' | 'soft-fail' | 'hard-fail';
  message: string;
  statusCode?: number;
}

const SOFT_FAIL_STATUS_CODES = new Set([403, 429]);
const MAX_RETRIES = 2;
const TIMEOUT_MS = 8000;
const USER_AGENT = 'africa-ats-directory/1.0 (+https://github.com/africa-ats-directory)';

function expectedBoardUrl(platform: Platform, metadata: Record<string, unknown>): string | null {
  const read = (key: string): string | null => (typeof metadata[key] === 'string' ? String(metadata[key]) : null);

  switch (platform) {
    case 'greenhouse': {
      const token = read('board_token');
      return token ? `https://boards.greenhouse.io/${token}` : null;
    }
    case 'lever': {
      const token = read('board_token');
      return token ? `https://jobs.lever.co/${token}` : null;
    }
    case 'ashby': {
      const token = read('board_token');
      return token ? `https://jobs.ashbyhq.com/${token}` : null;
    }
    case 'smartrecruiters': {
      const slug = read('org_slug');
      return slug ? `https://jobs.smartrecruiters.com/${slug}` : null;
    }
    case 'workable': {
      const slug = read('account_slug');
      return slug ? `https://apply.workable.com/${slug}` : null;
    }
    case 'bamboohr': {
      const subdomain = read('subdomain');
      return subdomain ? `https://${subdomain}.bamboohr.com/careers` : null;
    }
    case 'breezyhr': {
      const subdomain = read('subdomain');
      return subdomain ? `https://${subdomain}.breezy.hr` : null;
    }
    case 'recruitee': {
      const subdomain = read('subdomain');
      return subdomain ? `https://${subdomain}.recruitee.com` : null;
    }
  }
}

function isFinalUrlConsistent(platform: Platform, metadata: Record<string, unknown>, finalUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  const read = (key: string): string | null =>
    typeof metadata[key] === 'string' ? String(metadata[key]).toLowerCase() : null;

  switch (platform) {
    case 'greenhouse': {
      const token = read('board_token');
      return !!token && host.endsWith('greenhouse.io') && path.includes(`/${token}`);
    }
    case 'lever': {
      const token = read('board_token');
      return !!token && host === 'jobs.lever.co' && path.startsWith(`/${token}`);
    }
    case 'ashby': {
      const token = read('board_token');
      return !!token && host === 'jobs.ashbyhq.com' && path.startsWith(`/${token}`);
    }
    case 'smartrecruiters': {
      const slug = read('org_slug');
      const smartHost = host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com';
      return !!slug && smartHost && path.includes(`/${slug}`);
    }
    case 'workable': {
      const slug = read('account_slug');
      const workableHost = host === 'apply.workable.com' || host === 'jobs.workable.com';
      return !!slug && workableHost && path.startsWith(`/${slug}`);
    }
    case 'bamboohr': {
      const subdomain = read('subdomain');
      return !!subdomain && host === `${subdomain}.bamboohr.com`;
    }
    case 'breezyhr': {
      const subdomain = read('subdomain');
      return !!subdomain && host === `${subdomain}.breezy.hr`;
    }
    case 'recruitee': {
      const subdomain = read('subdomain');
      return !!subdomain && host === `${subdomain}.recruitee.com`;
    }
  }
}

function isRecognizedAtsHost(hostname: string): boolean {
  return ATS_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelySoftNetworkError(error: unknown): boolean {
  const text = String(error).toLowerCase();
  return (
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('enotfound') ||
    text.includes('eai_again') ||
    text.includes('networkerror') ||
    text.includes('fetch failed')
  );
}

async function probeBoard(platform: Platform, metadata: Record<string, unknown>, url: string): Promise<ProbeResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const finalHost = parseHostname(response.url);
      const recognizedFinalHost = finalHost ? isRecognizedAtsHost(finalHost) : false;
      const finalUrlMatchesEntry = isFinalUrlConsistent(platform, metadata, response.url);

      if (response.status >= 200 && response.status < 300) {
        if (!finalUrlMatchesEntry) {
          return {
            kind: 'hard-fail',
            message: `HTTP ${response.status} but final URL does not match expected board (${response.url})`,
            statusCode: response.status,
          };
        }

        return {
          kind: 'pass',
          message: recognizedFinalHost ? `HTTP ${response.status} (${response.url})` : `HTTP ${response.status} (${response.url})`,
          statusCode: response.status,
        };
      }

      if (response.status >= 300 && response.status < 400 && recognizedFinalHost) {
        return {
          kind: 'pass',
          message: `HTTP ${response.status} redirect on ATS host (${response.url})`,
          statusCode: response.status,
        };
      }

      if (response.status === 404) {
        return {
          kind: 'hard-fail',
          message: `HTTP 404 (${response.url})`,
          statusCode: response.status,
        };
      }

      if (SOFT_FAIL_STATUS_CODES.has(response.status) || response.status >= 500) {
        return {
          kind: 'soft-fail',
          message: `HTTP ${response.status} (${response.url})`,
          statusCode: response.status,
        };
      }

      return {
        kind: 'hard-fail',
        message: `HTTP ${response.status} (${response.url})`,
        statusCode: response.status,
      };
    } catch (error: unknown) {
      clearTimeout(timer);
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * 2 ** attempt;
        await sleep(delayMs);
        continue;
      }
    }
  }

  if (isLikelySoftNetworkError(lastError)) {
    return {
      kind: 'soft-fail',
      message: `network issue: ${String(lastError)}`,
    };
  }

  return {
    kind: 'hard-fail',
    message: `request failed: ${String(lastError)}`,
  };
}

async function main(): Promise<void> {
  let hardErrors = 0;
  let softWarnings = 0;

  const allIds = new Map<string, string>();
  const toProbe: ValidationTarget[] = [];

  for (const platform of PLATFORMS) {
    const fileName = `${platform}.json`;
    const filePath = path.join(companiesDir, fileName);

    if (!fs.existsSync(filePath)) {
      console.error(`✗ Missing required platform file: ${fileName}`);
      hardErrors++;
      continue;
    }

    let entries: unknown;
    try {
      entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error(`✗ Invalid JSON in ${fileName}: ${String(err)}`);
      hardErrors++;
      continue;
    }

    if (!Array.isArray(entries)) {
      console.error(`✗ ${fileName} must be a JSON array`);
      hardErrors++;
      continue;
    }

    for (const entry of entries as Record<string, unknown>[]) {
      const entryLabel = typeof entry.id === 'string' ? entry.id : JSON.stringify(entry).slice(0, 80);

      if (!validate(entry)) {
        console.error(`✗ Schema error in ${fileName} — ${entryLabel}`);
        for (const err of validate.errors ?? []) {
          console.error(`    ${err.instancePath || '(root)'} ${err.message}`);
        }
        hardErrors++;
        continue;
      }

      if (entry.ats !== platform) {
        console.error(`✗ ${fileName} entry "${entryLabel}" has ats="${String(entry.ats)}"`);
        hardErrors++;
      }

      if (typeof entry.id === 'string') {
        const existing = allIds.get(entry.id);
        if (existing) {
          console.error(`✗ Duplicate id "${entry.id}" found in ${fileName} and ${existing}`);
          hardErrors++;
        } else {
          allIds.set(entry.id, fileName);
        }
      }

      const expectedKey = PLATFORM_METADATA_KEY[platform];
      const metadata = entry.platform_metadata as Record<string, unknown>;
      const keys = Object.keys(metadata);
      if (keys.length !== 1 || keys[0] !== expectedKey) {
        console.error(
          `✗ ${fileName} entry "${entryLabel}" has invalid platform_metadata keys: [${keys.join(', ')}], expected [${expectedKey}]`
        );
        hardErrors++;
      }

      if (platform === 'smartrecruiters' && typeof metadata.org_slug === 'string') {
        const normalized = metadata.org_slug.toLowerCase();
        if (metadata.org_slug !== normalized) {
          console.error(
            `✗ ${fileName} entry "${entryLabel}" must use lowercase smartrecruiters org_slug (got "${metadata.org_slug}")`
          );
          hardErrors++;
        }
      }

      if (typeof entry.board_url === 'string') {
        const expectedUrl = expectedBoardUrl(platform, metadata);
        if (expectedUrl && entry.board_url !== expectedUrl) {
          console.error(
            `✗ ${fileName} entry "${entryLabel}" has board_url="${entry.board_url}" but expected "${expectedUrl}"`
          );
          hardErrors++;
        }
      }

      const hostname = typeof entry.board_url === 'string' ? parseHostname(entry.board_url) : null;
      if (!hostname) {
        console.error(`✗ ${fileName} entry "${entryLabel}" has malformed board_url`);
        hardErrors++;
      }

      const typedEntry = entry as unknown as CompanyEntry;
      if (typedEntry.status === 'inactive') {
        console.log(`- Skipping board probe for inactive entry: ${typedEntry.id}`);
      } else {
        toProbe.push({
          platform,
          fileName,
          entry: typedEntry,
        });
      }
    }
  }

  if (SKIP_BOARD_PROBES) {
    console.log('- Skipping board probes due to SKIP_BOARD_PROBES=1');
  } else {
    for (const target of toProbe) {
      const result = await probeBoard(target.platform, target.entry.platform_metadata, target.entry.board_url);
      if (result.kind === 'pass') {
        console.log(`✓ Board check passed: ${target.entry.id} (${result.message})`);
        continue;
      }

      if (result.kind === 'soft-fail') {
        softWarnings++;
        console.warn(
          `! Soft-fail: ${target.fileName} entry "${target.entry.id}" verification_status=needs_recheck (${result.message})`
        );
        continue;
      }

      hardErrors++;
      console.error(`✗ Hard-fail: ${target.fileName} entry "${target.entry.id}" (${result.message})`);
    }
  }

  if (hardErrors > 0) {
    console.error(`VALIDATION_SUMMARY hard_errors=${hardErrors} soft_warnings=${softWarnings} total_entries=${allIds.size}`);
    console.error(`\n✗ Validation failed with ${hardErrors} hard error(s) and ${softWarnings} soft warning(s)`);
    process.exit(1);
  }

  console.log(`VALIDATION_SUMMARY hard_errors=${hardErrors} soft_warnings=${softWarnings} total_entries=${allIds.size}`);
  console.log(`\n✓ Validation passed with ${allIds.size} entries and ${softWarnings} soft warning(s)`);
}

main().catch((err: unknown) => {
  console.error(`✗ Validation crashed: ${String(err)}`);
  process.exit(1);
});
