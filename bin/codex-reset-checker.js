#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const ENDPOINT = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits';

function printHelp() {
  console.log(`Usage:
  npx codex-reset-checker
  codex-reset-checker [options]

Options:
  --json                 Print machine-readable JSON.
  --auth-file <path>     Read Codex auth JSON from a custom path.
                         Defaults to ~/.codex/auth.json.
  --timezone <tz>        Format timestamps in a specific IANA timezone.
                         Defaults to your local timezone.
  -h, --help             Show this help.

This command reads tokens.access_token from the auth file, sends it as a
Bearer token, and prints only available_count plus each credit's
status/title/granted_at/expires_at fields.`);
}

function parseArgs(argv) {
  const options = {
    authFile: path.join(os.homedir(), '.codex', 'auth.json'),
    json: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--auth-file') {
      const value = argv[i + 1];
      if (!value) throw new Error('--auth-file requires a path');
      options.authFile = value.startsWith('~')
        ? path.join(os.homedir(), value.slice(1))
        : path.resolve(value);
      i += 1;
    } else if (arg === '--timezone') {
      const value = argv[i + 1];
      if (!value) throw new Error('--timezone requires an IANA timezone');
      options.timezone = value;
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readAccessToken(authFile) {
  let auth;
  try {
    auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read auth file: ${error.message}`);
  }

  const token = auth && auth.tokens && auth.tokens.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('Missing tokens.access_token in auth file');
  }

  return token;
}

function requestCredits(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      ENDPOINT,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'codex-reset-checker',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;

  let date;
  if (typeof value === 'number') {
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return String(value);
  return date;
}

function formatOffset(parts) {
  const timeZoneName = parts.find((part) => part.type === 'timeZoneName');
  return timeZoneName ? timeZoneName.value.replace(/^GMT([+-])0/, 'GMT$1') : '';
}

function formatLocalTimestamp(value, timezone) {
  const date = parseTimestamp(value);
  if (date === null || typeof date === 'string') return date;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });

  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const offset = formatOffset(parts);

  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}:${byType.second}${offset ? ` ${offset}` : ''}`;
}

function stripOffset(value) {
  return typeof value === 'string' ? value.replace(/ GMT[+-]\d+(?::\d+)?$/, '') : value;
}

function pad(value, width) {
  const text = value === null || value === undefined ? '' : String(value);
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}

function makeDivider(widths) {
  return widths.map((width) => '-'.repeat(width)).join('  ');
}

function terminalWidth() {
  return process.stdout && process.stdout.columns ? process.stdout.columns : 100;
}

function truncate(value, width) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function sortByExpiry(credits) {
  return [...credits].sort((a, b) => {
    const aTime = Date.parse(a.expires_at || '');
    const bTime = Date.parse(b.expires_at || '');
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });
}

function pickCredits(payload) {
  if (Array.isArray(payload && payload.credits)) return payload.credits;
  if (Array.isArray(payload && payload.rate_limit_reset_credits)) return payload.rate_limit_reset_credits;
  if (Array.isArray(payload && payload.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

function summarize(payload, timezone) {
  const credits = pickCredits(payload).map((credit) => ({
    status: credit && credit.status !== undefined ? credit.status : null,
    title: credit && credit.title !== undefined ? credit.title : null,
    granted_at: formatLocalTimestamp(
      credit && (credit.granted_at !== undefined ? credit.granted_at : credit.grantedAt),
      timezone
    ),
    expires_at: formatLocalTimestamp(
      credit && (credit.expires_at !== undefined ? credit.expires_at : credit.expiresAt),
      timezone
    ),
  }));

  const availableCount = payload && payload.available_count !== undefined
    ? payload.available_count
    : payload && payload.availableCount !== undefined
      ? payload.availableCount
      : credits.filter((credit) => credit.status === 'available').length;

  return {
    available_count: availableCount,
    timezone,
    credits,
  };
}

function printSummary(summary) {
  console.log('Codex reset credits');
  console.log(`Available: ${summary.available_count} reset${summary.available_count === 1 ? '' : 's'}`);
  console.log(`Timezone: ${summary.timezone}`);

  if (!summary.credits.length) {
    console.log('');
    console.log('No reset credits found.');
    return;
  }

  const rows = sortByExpiry(summary.credits).map((credit, index) => ({
    index: String(index + 1),
    status: credit.status || '',
    expires: stripOffset(credit.expires_at) || '',
    granted: stripOffset(credit.granted_at) || '',
    title: credit.title || '',
  }));

  const fixedWidths = {
    index: Math.max(1, String(rows.length).length),
    status: Math.max(6, ...rows.map((row) => row.status.length)),
    expires: Math.max('Expires'.length, ...rows.map((row) => row.expires.length)),
    granted: Math.max('Granted'.length, ...rows.map((row) => row.granted.length)),
  };

  const fixedWidthTotal = fixedWidths.index + fixedWidths.status + fixedWidths.expires + fixedWidths.granted + 10;
  const titleWidth = Math.max(12, Math.min(40, terminalWidth() - fixedWidthTotal));
  const widths = [fixedWidths.index, fixedWidths.status, fixedWidths.expires, fixedWidths.granted, titleWidth];

  console.log('');
  console.log([
    pad('#', widths[0]),
    pad('Status', widths[1]),
    pad('Expires', widths[2]),
    pad('Granted', widths[3]),
    'Title',
  ].join('  '));
  console.log(makeDivider(widths));

  rows.forEach((row) => {
    console.log([
      pad(row.index, widths[0]),
      pad(row.status, widths[1]),
      pad(row.expires, widths[2]),
      pad(row.granted, widths[3]),
      truncate(row.title, titleWidth),
    ].join('  '));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const accessToken = readAccessToken(options.authFile);
  const response = await requestCredits(accessToken);

  if (response.statusCode === 401) {
    throw new Error('401 Unauthorized: credential is expired or the Authorization header was not accepted');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Request failed with HTTP ${response.statusCode}`);
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch (error) {
    throw new Error(`Response was not valid JSON: ${error.message}`);
  }

  const summary = summarize(payload, options.timezone);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
