// Edge-safe (no Node APIs): used by the middleware to inspect URL query strings.

const SQLI_PATTERNS = [
  /(\b(select|union|insert|delete|update|drop|truncate|alter|create|load_file|outfile)\b[\s\S]+\b(from|into|table|database|schema)\b)/i,
  /(\bunion\b[\s\S]+\bselect\b)/i,
  /((\%27)|(')|(\-\-)|(\%23)|(#))(\s)*(or|and|exec|execute|union)\b/i,
  /(\b(or|and)\b\s+[\w\d'"]+\s*=\s*[\w\d'"]+)/i,
  /(\b(sleep|benchmark|waitfor|pg_sleep)\s*\(\s*\d+\s*\))/i,
  /('[\s\S]*--)|(;[\s\S]*--)/i,
];

const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /<script[\s\S]*?>/i,
  /javascript\s*:/i,
  /onload\s*=\s*['"]?[^'"]*['"]?/i,
  /onerror\s*=\s*['"]?[^'"]*['"]?/i,
  /<iframe[\s\S]*?>/i,
  /<img[\s\S]+?onerror/i,
  /<svg[\s\S]+?onload/i,
  /document\.cookie/i,
];

const MAX_DECODE_ROUNDS = 3;

// Decodes each run of %XX on its own, so one malformed sequence (e.g. a
// trailing `%ZZ` added to dodge detection) cannot stop the rest of the
// query from being decoded, as decodeURIComponent on the whole string would.
function lenientDecode(value: string): string {
  return value.replace(/\+/g, ' ').replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      // Invalid UTF-8 in this run: fall back to byte-by-byte (Latin-1) so
      // ASCII characters such as %3C still become `<`.
      return run.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
  });
}

/**
 * Browsers percent-encode the query before sending it (`<script>` arrives as
 * `%3Cscript%3E`, spaces as `%20` or `+`), so patterns must also be matched
 * against the decoded text. Decoding is repeated to catch double encoding
 * (`%253C`).
 */
export function decodedQueryVariants(search: string): string[] {
  const variants = [search];
  let current = search;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const next = lenientDecode(current);
    if (next === current) break;
    variants.push(next);
    current = next;
  }
  return variants;
}

export type QueryAttackType = 'sql_injection_attempt' | 'xss_attempt';

export function inspectQueryString(search: string): QueryAttackType | null {
  if (!search) return null;
  const variants = decodedQueryVariants(search);
  if (variants.some((v) => SQLI_PATTERNS.some((p) => p.test(v)))) return 'sql_injection_attempt';
  if (variants.some((v) => XSS_PATTERNS.some((p) => p.test(v)))) return 'xss_attempt';
  return null;
}
