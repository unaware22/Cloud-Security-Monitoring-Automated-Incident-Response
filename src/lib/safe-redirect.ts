/**
 * Accepts only same-origin paths. This prevents a crafted `redirect` query
 * parameter from sending a newly authenticated user to an attacker-controlled
 * website.
 */
export function getSafeInternalRedirect(
  candidate: string | null | undefined,
  fallback = '/account'
): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  try {
    const base = new URL('https://saladinshop.invalid');
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
