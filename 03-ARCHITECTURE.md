# Architecture Design

## 1. Recommended AWS Architecture
```text
Internet
  -> EC2 Web App + Nginx + Wazuh Agent
  -> Amazon RDS PostgreSQL private/no public access
  -> EC2 Monitoring: Wazuh Manager + Dashboard + n8n
  -> Telegram/Discord Alert
```

## 2. Future Production Enhancement
Jika CloudFront sudah bisa dipakai:
```text
Internet
  -> CloudFront + Shield Standard
  -> AWS WAF
  -> ALB or EC2 Web App
  -> RDS PostgreSQL private
  -> Wazuh/n8n Monitoring
```

Jika CloudFront belum bisa, alternatif:
```text
Internet
  -> EC2 Nginx HTTPS + Nginx Rate Limit
  -> RDS Private
```
Atau AWS-native:
```text
Internet
  -> AWS WAF
  -> Application Load Balancer
  -> EC2 Web App
  -> RDS Private
```

## 3. Components
### EC2 Web App
- Runs frontend/backend app.
- Runs Nginx reverse proxy.
- Runs Wazuh Agent.
- Sends logs to Wazuh Manager.

### Amazon RDS PostgreSQL
- Private access only.
- Public Access: No.
- Security Group allows only EC2 Web App SG.
- Stores products, orders, payments, audit logs, security events.

### EC2 Monitoring
- Wazuh Manager.
- Wazuh Dashboard.
- n8n automation.
- Sends notification to Telegram/Discord.

## 4. Security Group Plan
### WebApp-SG
Inbound:
- 80/443 from 0.0.0.0/0
- 22 only from owner IP
Outbound:
- 5432 to RDS-SG
- Wazuh ports to Monitoring-SG

### RDS-SG
Inbound:
- 5432 only from WebApp-SG
Outbound:
- default or restricted as needed

### Monitoring-SG
Inbound:
- Wazuh agent ports from WebApp-SG
- Dashboard/n8n only from owner IP
- SSH only from owner IP

## 5. Cost Notes
Avoid:
- NAT Gateway
- Shield Advanced
- Multi-AZ RDS during development
- Aurora
- heavy load testing

Use:
- t3.medium for web and monitoring if credit is enough
- db.t3.micro/db.t4g.micro for RDS
- stop EC2 when not used
