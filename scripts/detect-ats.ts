/**
 * detect-ats.ts
 *
 * Usage:
 *   ts-node scripts/detect-ats.ts <careers-url>
 */

const careersUrl = process.argv[2];

if (!careersUrl) {
  console.error('Usage: ts-node scripts/detect-ats.ts <careers-url>');
  process.exit(1);
}

const USER_AGENT = 'africa-ats-directory/1.0 (+https://github.com/africa-ats-directory)';
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10000;

type Ats =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'workable'
  | 'bamboohr'
  | 'breezyhr'
  | 'recruitee';

interface RedirectHop {
  url: string;
  status: number;
  location: string | null;
}

interface ResolvedPage {
  finalUrl: string;
  status: number;
  html: string;
  chain: RedirectHop[];
}

interface MatchResult {
  ats: Ats;
  boardUrl: string;
  platformMetadata: Record<string, string>;
  confidence: number;
  detectionSignals: string[];
}

async function fetchWithRedirects(url: string, maxRedirects: number): Promise<ResolvedPage> {
  let current = url;
  const chain: RedirectHop[] = [];

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const location = response.headers.get('location');
    chain.push({ url: current, status: response.status, location });

    if (response.status >= 300 && response.status < 400 && location) {
      if (i === maxRedirects) {
        throw new Error(`Exceeded ${maxRedirects} redirects`);
      }
      current = new URL(location, current).toString();
      continue;
    }

    const html = await response.text();
    return {
      finalUrl: current,
      status: response.status,
      html,
      chain,
    };
  }

  throw new Error('Redirect resolution failed');
}

function findMatch(finalUrl: string, html: string, chain: RedirectHop[]): MatchResult | null {
  const finalUrlObj = new URL(finalUrl);
  const finalHost = finalUrlObj.hostname.toLowerCase();
  const content = `${finalUrl}\n${html}`;

  const matchers: Array<() => MatchResult | null> = [
    () => {
      const direct = finalUrl.match(/https?:\/\/(?:boards\.greenhouse\.io)\/([^/"'\s?#]+)/i);
      const fromContent = content.match(/https?:\/\/(?:boards\.greenhouse\.io)\/([^/"'\s?#]+)/i);
      const fromShort = content.match(/https?:\/\/grnh\.se\/([^/"'\s?#]+)/i);
      const token = direct?.[1] ?? fromContent?.[1] ?? fromShort?.[1] ?? null;
      if (!token) return null;
      const signal = direct ? 'url-match:boards.greenhouse.io' : 'html-match:greenhouse';
      const chainSignal = chain.some((hop) => hop.url.includes('grnh.se')) ? 'redirect:grnh.se' : null;
      return {
        ats: 'greenhouse',
        boardUrl: `https://boards.greenhouse.io/${token}`,
        platformMetadata: { board_token: token },
        confidence: direct ? 0.95 : 0.8,
        detectionSignals: [signal, ...(chainSignal ? [chainSignal] : [])],
      };
    },
    () => {
      const match = content.match(/https?:\/\/jobs\.lever\.co\/([^/"'\s?#]+)/i);
      if (!match) return null;
      const token = match[1];
      return {
        ats: 'lever',
        boardUrl: `https://jobs.lever.co/${token}`,
        platformMetadata: { board_token: token },
        confidence: finalHost === 'jobs.lever.co' ? 0.95 : 0.8,
        detectionSignals: [finalHost === 'jobs.lever.co' ? 'url-match:jobs.lever.co' : 'html-match:jobs.lever.co'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/jobs\.ashbyhq\.com\/([^/"'\s?#]+)/i);
      if (!match) return null;
      const token = match[1];
      return {
        ats: 'ashby',
        boardUrl: `https://jobs.ashbyhq.com/${token}`,
        platformMetadata: { board_token: token },
        confidence: finalHost === 'jobs.ashbyhq.com' ? 0.95 : 0.8,
        detectionSignals: [finalHost === 'jobs.ashbyhq.com' ? 'url-match:jobs.ashbyhq.com' : 'html-match:jobs.ashbyhq.com'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^/"'\s?#]+)/i);
      if (!match) return null;
      const slug = match[1].toLowerCase();
      return {
        ats: 'smartrecruiters',
        boardUrl: `https://jobs.smartrecruiters.com/${slug}`,
        platformMetadata: { org_slug: slug },
        confidence: /(?:jobs|careers)\.smartrecruiters\.com$/i.test(finalHost) ? 0.95 : 0.8,
        detectionSignals: [/(?:jobs|careers)\.smartrecruiters\.com$/i.test(finalHost) ? 'url-match:smartrecruiters' : 'html-match:smartrecruiters'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/(?:apply|jobs)\.workable\.com\/([^/"'\s?#]+)/i);
      if (!match) return null;
      const slug = match[1];
      return {
        ats: 'workable',
        boardUrl: `https://apply.workable.com/${slug}`,
        platformMetadata: { account_slug: slug },
        confidence: /(?:apply|jobs)\.workable\.com$/i.test(finalHost) ? 0.95 : 0.8,
        detectionSignals: [/(?:apply|jobs)\.workable\.com$/i.test(finalHost) ? 'url-match:workable' : 'html-match:workable'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/([a-z0-9-]+)\.bamboohr\.com(?:\/|$)/i);
      if (!match) return null;
      const subdomain = match[1];
      return {
        ats: 'bamboohr',
        boardUrl: `https://${subdomain}.bamboohr.com/careers`,
        platformMetadata: { subdomain },
        confidence: finalHost.endsWith('.bamboohr.com') ? 0.95 : 0.8,
        detectionSignals: [finalHost.endsWith('.bamboohr.com') ? 'url-match:bamboohr' : 'html-match:bamboohr'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/([a-z0-9-]+)\.breezy\.hr(?:\/|$)/i);
      if (!match) return null;
      const subdomain = match[1];
      return {
        ats: 'breezyhr',
        boardUrl: `https://${subdomain}.breezy.hr`,
        platformMetadata: { subdomain },
        confidence: finalHost.endsWith('.breezy.hr') ? 0.95 : 0.8,
        detectionSignals: [finalHost.endsWith('.breezy.hr') ? 'url-match:breezyhr' : 'html-match:breezyhr'],
      };
    },
    () => {
      const match = content.match(/https?:\/\/([a-z0-9-]+)\.recruitee\.com(?:\/|$)/i);
      if (!match) return null;
      const subdomain = match[1];
      return {
        ats: 'recruitee',
        boardUrl: `https://${subdomain}.recruitee.com`,
        platformMetadata: { subdomain },
        confidence: finalHost.endsWith('.recruitee.com') ? 0.95 : 0.8,
        detectionSignals: [finalHost.endsWith('.recruitee.com') ? 'url-match:recruitee' : 'html-match:recruitee'],
      };
    },
  ];

  for (const runMatcher of matchers) {
    const match = runMatcher();
    if (match) return match;
  }

  return null;
}

async function main(): Promise<void> {
  console.log(`Detecting ATS for: ${careersUrl}`);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(careersUrl);
  } catch {
    console.error('Invalid URL input. Provide a full URL like https://example.com/careers');
    process.exit(1);
    return;
  }

  const resolved = await fetchWithRedirects(parsedUrl.toString(), MAX_REDIRECTS);
  console.log(`Final URL: ${resolved.finalUrl}`);
  console.log(`HTTP status: ${resolved.status}`);

  const matched = findMatch(resolved.finalUrl, resolved.html, resolved.chain);
  if (!matched) {
    console.log('Could not detect a supported ATS from URL redirects, anchors, or iframes.');
    process.exit(2);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  const draft = {
    id: 'replace-with-company-slug-country',
    company: 'Replace Company Name',
    ats: matched.ats,
    country: 'KE',
    city: 'Nairobi',
    sector: 'other',
    sector_raw: '',
    status: 'unknown',
    careers_url: careersUrl,
    board_url: matched.boardUrl,
    platform_metadata: matched.platformMetadata,
    verification: {
      method: 'auto-detected',
      confidence: matched.confidence,
      first_seen_at: today,
      last_checked_at: today,
      last_status_code: resolved.status,
    },
    evidence: {
      detected_from_url: careersUrl,
      resolved_board_url: matched.boardUrl,
      detection_signals: matched.detectionSignals,
      notes: `Redirect chain length: ${resolved.chain.length}`,
    },
    source: {
      submitted_by: 'github:replace-handle',
      submitted_at: today,
    },
  };

  console.log(`\nDetected ATS: ${matched.ats}`);
  console.log(`Board URL: ${matched.boardUrl}`);
  console.log(`Confidence: ${matched.confidence}`);
  console.log('\nDetection output:');
  console.log(
    JSON.stringify(
      {
        ats: matched.ats,
        board_url: matched.boardUrl,
        platform_metadata: matched.platformMetadata,
        confidence: matched.confidence,
        detection_signals: matched.detectionSignals,
      },
      null,
      2
    )
  );

  console.log('\nDraft entry (fill in id/company/city/sector/source before committing):');
  console.log(JSON.stringify(draft, null, 2));
}

main().catch((err: unknown) => {
  const message = String(err);
  if (message.includes('AbortError')) {
    console.error(`Detection failed: request timed out after ${REQUEST_TIMEOUT_MS}ms`);
  } else {
    console.error(`Detection failed: ${message}`);
  }
  process.exit(1);
});
