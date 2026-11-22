// Maps an application security event to the Wazuh rule(s) configured to match
// it (see 15-PANDUAN-UJI-10-SKENARIO.md). This is the configured mapping, not proof
// that Wazuh fired: the admin Security Events page reads the app database, not
// Wazuh alerts. Correlation rules that fire on a series of events (e.g. 100201,
// 100501) are not listed per event.

const BASE_RULES: Record<string, string> = {
  sql_injection_attempt: '100100',
  sensitive_path_scan: '100200',
  xss_attempt: '100800',
  user_bruteforce_attempt: '100300',
  admin_bruteforce_attempt: '100301',
  credential_stuffing_attempt: '100400',
  account_takeover_attempt: '100401',
  unauthorized_object_access_attempt: '100500',
  checkout_abuse: '100600',
  bot_order_attempt: '100601',
  voucher_abuse_attempt: '100700',
  checkout_tampering_attempt: '100702',
  invalid_payment_callback: '100900',
  user_password_reset_abuse: '101000',
  device_banned: '101100',
  account_banned: '101101',
  banned_device_request: '101102',
  banned_account_request: '101103',
};

// Child rules that refine the base rule from the payload snippet.
const CHILD_RULES: Array<{ eventType: string; pattern: RegExp; ruleId: string }> = [
  { eventType: 'voucher_abuse_attempt', pattern: /reason=reuse/, ruleId: '100701' },
  { eventType: 'invalid_payment_callback', pattern: /gross_amount=/, ruleId: '100901' },
  {
    eventType: 'user_password_reset_abuse',
    pattern: /Exceeded rate limit for forgot_password/,
    ruleId: '101001',
  },
];

export function wazuhRulesForEvent(eventType: string, payloadSnippet?: string | null): string[] {
  const base = BASE_RULES[eventType];
  if (!base) return [];
  const child = CHILD_RULES.find(
    (rule) => rule.eventType === eventType && rule.pattern.test(payloadSnippet || '')
  );
  return child ? [base, child.ruleId] : [base];
}
