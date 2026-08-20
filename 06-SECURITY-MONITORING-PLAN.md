# Security Monitoring and Testing Plan

## 1. Testing Philosophy
Aplikasi tidak dibuat vulnerable secara sengaja. Pengujian dilakukan untuk memastikan percobaan serangan gagal, tercatat, dan memicu alert.

## 2. Main Test Cases
| No | Test | Target | Expected Result |
|---:|---|---|---|
| 1 | Admin brute force | /admin/login | Failed attempts logged, rate limited, alert |
| 2 | SQLi attempt | product/search/check-order | Request rejected/safe, security event |
| 3 | XSS attempt | checkout inputs | Payload sanitized/rejected, security event |
| 4 | Order enumeration | /api/orders/check | No data leak, rate limit, alert |
| 5 | Checkout abuse | /api/orders | 429/rate limit, alert |
| 6 | Fake Xendit callback | /api/payments/xendit/webhook | Invalid signature rejected, high alert |
| 7 | Unauthorized admin access | /api/admin/* | 401/403, event logged |
| 8 | Sensitive path scan | /.env, /.git/config, /backup.zip | 404/403, event logged |
| 9 | Port scan | EC2 public IP | Only expected ports open; alert/log |
| 10 | Traffic spike simulation | Homepage/API | Rate limit works, no crash |
| 11 | Direct RDS access attempt | RDS endpoint | Fail from internet, success only from EC2 |

## 3. Metrics
- Detection rate
- Response time
- False positive count
- Blocking success rate
- Resource usage CPU/RAM
- Rate limit effectiveness

## 4. Wazuh Log Sources
- Nginx access/error logs
- Application JSON logs
- Security event JSON logs
- Auth logs `/var/log/auth.log`
- File integrity monitoring for selected config files

## 5. n8n Workflow
```text
Wazuh Alert
  -> n8n Webhook
  -> Parse severity/event_type/ip
  -> If severity medium/high: Telegram/Discord notification
  -> If threshold exceeded: trigger blocklist workflow
  -> Save incident record
```

## 6. Safe Traffic Spike Test
Use small controlled test only:
- 100-1000 requests total
- concurrency 10-20
- never run destructive DDoS tools
- document this as traffic anomaly simulation, not real DDoS

## 7. Thesis Framing
Penelitian menguji kemampuan monitoring dan incident response terhadap aktivitas mencurigakan pada aplikasi yang aman dan production-like, bukan eksploitasi sistem yang sengaja dibuat rentan.
