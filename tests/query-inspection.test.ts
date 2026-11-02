import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectQueryString } from '../src/lib/query-inspection';

test('detects XSS exactly as a browser sends it from the address bar', () => {
  // What Firefox/Chrome send for ?q=<script>alert('XSS-UJI')</script>
  assert.equal(inspectQueryString("?q=%3Cscript%3Ealert('XSS-UJI')%3C/script%3E"), 'xss_attempt');
  assert.equal(inspectQueryString('?q=%3Cimg%20src=x%20onerror=alert(1)%3E'), 'xss_attempt');
  assert.equal(inspectQueryString('?q=javascript%3Aalert(1)'), 'xss_attempt');
});

test('detects double-encoded XSS', () => {
  assert.equal(inspectQueryString('?q=%253Cscript%253Ealert(1)%253C%252Fscript%253E'), 'xss_attempt');
});

test("detects encoded SQLi that the raw check missed (' OR 1=1--)", () => {
  assert.equal(inspectQueryString('?search=%27%20OR%201%3D1%20--'), 'sql_injection_attempt');
  assert.equal(inspectQueryString("?search='+OR+1=1+--"), 'sql_injection_attempt');
  assert.equal(inspectQueryString('?q=1%20UNION%20SELECT%20password%20FROM%20users'), 'sql_injection_attempt');
});

test('does not flag normal searches', () => {
  for (const q of [
    '?q=minecraft',
    '?q=akun%20minecraft%20java%20%26%20bedrock',
    '?q=diamond+sword',
    '?category=roblox&sort=price_asc',
    '?q=skin%20custom%2064x64',
    '?q=100%25%20original',
  ]) {
    assert.equal(inspectQueryString(q), null, q);
  }
});

test('malformed percent sequences do not throw', () => {
  assert.equal(inspectQueryString('?q=%E0%A4%A'), null);
  assert.equal(inspectQueryString('?q=%3Cscript%3E%ZZ'), 'xss_attempt');
});
