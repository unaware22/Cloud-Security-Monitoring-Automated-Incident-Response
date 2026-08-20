# Production Deployment Guide — AWS EC2, Amazon RDS, Wazuh & n8n

Petunjuk lengkap deployment aplikasi e-commerce produk digital **NexusVault** pada infrastruktur AWS untuk penelitian skripsi monitoring keamanan dan respon insiden otomatis.

---

## 1. Arsitektur AWS & Security Group

```text
Internet
  │
  ├── [Port 80/443] ─────────► [EC2 Web App + Nginx + PM2 + Wazuh Agent]
  │                                │
  │                                ├── [Port 5432 (Private Only)] ──► [Amazon RDS PostgreSQL]
  │                                │
  │                                └── [Encrypted Agent Logs] ──────► [EC2 Monitoring (Wazuh + n8n)]
  │                                                                           │
  └───────────────────────────────────────────────────────────────────────────┴──► [Telegram / Discord Alert]
```

### Konfigurasi Security Group:

| Security Group | Inbound Rules | Outbound Rules |
| :--- | :--- | :--- |
| **WebApp-SG** | `80/443` dari `0.0.0.0/0`<br>`22` dari IP Operator/Admin | `5432` ke `RDS-SG`<br>`1514/1515` ke `Monitoring-SG` |
| **RDS-SG** | `5432` **HANYA** dari `WebApp-SG` | Default |
| **Monitoring-SG**| `1514/1515` dari `WebApp-SG`<br>`5678 (n8n)` dari IP Admin<br>`443 (Dashboard)` dari IP Admin | Default |

---

## 2. Setup Amazon RDS PostgreSQL (Private)

1. Buka AWS Console -> **Amazon RDS** -> **Create Database**.
2. Pilih **PostgreSQL** (Engine Version 16.x).
3. Template: **Free tier** / **Dev/Test** (`db.t3.micro` atau `db.t4g.micro`).
4. Settings:
   - DB instance identifier: `nexusvault-rds-postgres`
   - Master username: `postgres`
   - Master password: `[GENERATE_SECURE_PASSWORD]`
5. Connectivity:
   - Virtual Private Cloud (VPC): Default VPC atau Custom VPC Anda.
   - **Public Access: NO** (Wajib *No* untuk kepatuhan skripsi).
   - VPC security group: Pilih `RDS-SG`.
6. Database Name: `ecommerce_security_thesis`.

---

## 3. Setup EC2 Web App Server

### 3.1. Provisioning EC2
1. Launch Instance: Ubuntu 24.04 LTS / 22.04 LTS (Instance type: `t3.small` / `t3.medium`).
2. Security Group: Assign `WebApp-SG`.

### 3.2. Install Node.js, PM2 & Nginx
```bash
# Update repository
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### 3.3. Clone & Build Aplikasi
```bash
# Clone repository
sudo mkdir -p /var/www/ecommerce
sudo chown -R $USER:$USER /var/www/ecommerce
cd /var/www/ecommerce
git clone <YOUR_GIT_REPO_URL> .

# Setup Environment File (.env)
cp .env.example .env
nano .env
```

Isi `.env` dengan konfigurasi production:
```env
DATABASE_URL="postgresql://postgres:<RDS_PASSWORD>@<RDS_ENDPOINT>:5432/ecommerce_security_thesis?schema=public"
APP_BASE_URL="https://store.yourdomain.com"
ADMIN_JWT_SECRET="<GENERATE_RANDOM_SECRET_KEY_MIN_32_CHARS>"
XENDIT_SECRET_KEY="<YOUR_XENDIT_SECRET_KEY>"
XENDIT_WEBHOOK_TOKEN="<YOUR_XENDIT_WEBHOOK_TOKEN>"
LOG_DIR="/var/www/ecommerce/logs"
```

### 3.4. Database Migration & Seeding
```bash
# Install dependencies
npm install

# Jalankan migrasi Prisma ke Amazon RDS
npx prisma migrate dev --name init
# atau untuk sinkronisasi langsung:
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Seed initial admin & catalog data
npm run seed
```

### 3.5. Jalankan Aplikasi dengan PM2
```bash
# Build production bundle
npm run build

# Start with PM2
pm2 start npm --name "nexusvault-app" -- start
pm2 save
pm2 startup
```

### 3.6. Konfigurasi Nginx
```bash
sudo cp nginx.conf /etc/nginx/sites-available/nexusvault
sudo ln -s /etc/nginx/sites-available/nexusvault /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. Konfigurasi Wazuh Agent & Rules

### 4.1. Install Wazuh Agent pada EC2 Web App
```bash
# Install Wazuh repository & agent
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && sudo chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee -a /etc/apt/sources.list.d/wazuh.list
sudo apt update
sudo apt install -y wazuh-agent

# Daftarkan agent ke Wazuh Manager
sudo WAZUH_MANAGER="<IP_MONITORING_SERVER>" WAZUH_AGENT_NAME="ec2-webapp-node1" /var/ossec/bin/wazuh-control start
```

### 4.2. Pasang Localfile Config
Salin file konfigurasi `wazuh/ossec.conf` ke `/var/ossec/etc/ossec.conf` pada blok `<ossec_config>`.

### 4.3. Pasang Detection Rules pada Wazuh Manager (EC2 Monitoring)
Salin isi `wazuh/local_rules.xml` ke `/var/ossec/etc/rules/local_rules.xml` di server Wazuh Manager.
```bash
# Restart Wazuh Manager
sudo systemctl restart wazuh-manager
```

---

## 5. Pengujian & Verifikasi Keamanan

Jalankan test suite keamanan pada server untuk memastikan semua detection rule aktif dan tercatat di file log:

```bash
# Menjalankan simulasi keamanan terkendali
npm run test:security
```

Periksa log event yang dihasilkan:
```bash
tail -n 20 /var/www/ecommerce/logs/security_events.log
```

Semua 10 bidang format JSON Lines (`event_type`, `severity`, `ip_address`, `method`, `endpoint`, `user_agent`, `payload_snippet`, `status_code`, `request_id`, `created_at`) akan langsung terbaca oleh Wazuh Agent dan memicu alert n8n ke Telegram/Discord.
