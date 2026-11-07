// Maps an application security event to the Wazuh rule(s) configured to match
// it (see the test guides 14-20). This is the configured mapping, not proof
// that Wazuh fired: the admin Security Events page reads the app database, not
// Wazuh alerts. Correlation rules that fire on a series of events (e.g. 110501,
// 110511) are not listed per event.

const BASE_RULES: Record<string, string> = {
  sql_injection_attempt: '110100',
  xss_attempt: '110110',
  user_bruteforce_attempt: '110401',
  admin_bruteforce_attempt: '110411',
  credential_stuffing_attempt: '110420',
  account_takeover_attempt: '110421',
  unauthorized_object_access_attempt: '110500',
  checkout_abuse: '110510',
  bot_order_attempt: '110512',
  voucher_abuse_attempt: '110520',
  checkout_tampering_attempt: '110524',
  invalid_payment_callback: '110530',
  user_password_reset_abuse: '110540',
  device_banned: '110601',
  account_banned: '110602',
  banned_device_request: '110603',
  banned_account_request: '110604',
};

// Child rules that refine the base rule from the payload snippet.
const CHILD_RULES: Array<{ eventType: string; pattern: RegExp; ruleId: string }> = [
  { eventType: 'voucher_abuse_attempt', pattern: /reason=reuse/, ruleId: '110521' },
  { eventType: 'voucher_abuse_attempt', pattern: /reason=concurrent_reuse/, ruleId: '110522' },
  { eventType: 'invalid_payment_callback', pattern: /gross_amount=/, ruleId: '110531' },
  {
    eventType: 'user_password_reset_abuse',
    pattern: /Exceeded rate limit for forgot_password/,
    ruleId: '110541',
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
