// Account-enumeration defence: endpoints whose answer must not reveal whether
// an email is registered (forgot password, register, resend verification) do
// more database work for existing accounts. Answering every case no earlier
// than a fixed floor (plus jitter) keeps response time from giving that away.

export const ENUMERATION_SAFE_MIN_MS = 900;
export const ENUMERATION_SAFE_JITTER_MS = 200;

export async function waitForResponseFloor(
  startedAt: number,
  minMs = ENUMERATION_SAFE_MIN_MS,
  jitterMs = ENUMERATION_SAFE_JITTER_MS,
  random: () => number = Math.random
): Promise<void> {
  const target = minMs + Math.floor(random() * jitterMs);
  const remaining = target - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
