# Database Schema — PostgreSQL

## products
- id UUID PK
- name TEXT NOT NULL
- slug TEXT UNIQUE NOT NULL
- description TEXT
- price INTEGER NOT NULL
- stock INTEGER DEFAULT 0
- product_type TEXT DEFAULT 'digital'
- delivery_content TEXT
- is_active BOOLEAN DEFAULT true
- created_at TIMESTAMP
- updated_at TIMESTAMP

## orders
- id UUID PK
- order_code TEXT UNIQUE NOT NULL
- customer_name TEXT NOT NULL
- customer_email TEXT NOT NULL
- customer_phone TEXT
- total_amount INTEGER NOT NULL
- order_status TEXT NOT NULL
- payment_status TEXT NOT NULL
- delivery_status TEXT NOT NULL
- payment_method TEXT NOT NULL
- expired_at TIMESTAMP
- paid_at TIMESTAMP
- created_at TIMESTAMP
- updated_at TIMESTAMP

Recommended status:
- order_status: created, waiting_payment, processing, completed, cancelled, expired
- payment_status: pending, pending_manual, paid, paid_manual, failed, expired, rejected
- delivery_status: pending, processing, delivered, failed, resent

## order_items
- id UUID PK
- order_id UUID FK orders(id)
- product_id UUID FK products(id)
- product_name_snapshot TEXT
- quantity INTEGER
- price_snapshot INTEGER
- subtotal INTEGER

## payment_transactions
- id UUID PK
- order_id UUID FK orders(id)
- provider TEXT  -- xendit/manual
- provider_invoice_id TEXT
- provider_payment_id TEXT
- payment_url TEXT
- amount INTEGER
- status TEXT
- raw_payload JSONB
- created_at TIMESTAMP
- updated_at TIMESTAMP

## manual_payment_submissions
- id UUID PK
- order_id UUID FK orders(id)
- sender_name TEXT
- sender_bank TEXT
- amount INTEGER
- transfer_time TIMESTAMP
- note TEXT
- status TEXT  -- submitted, approved, rejected
- reviewed_by UUID FK admin_users(id)
- reviewed_at TIMESTAMP
- created_at TIMESTAMP

## digital_deliveries
- id UUID PK
- order_id UUID FK orders(id)
- delivery_email TEXT
- delivery_status TEXT
- delivered_at TIMESTAMP
- error_message TEXT
- created_at TIMESTAMP

## admin_users
- id UUID PK
- email TEXT UNIQUE NOT NULL
- password_hash TEXT NOT NULL
- role TEXT DEFAULT 'admin'
- is_active BOOLEAN DEFAULT true
- last_login_at TIMESTAMP
- created_at TIMESTAMP

## audit_logs
- id UUID PK
- admin_id UUID FK admin_users(id)
- action TEXT NOT NULL
- entity_type TEXT
- entity_id TEXT
- old_value JSONB
- new_value JSONB
- ip_address TEXT
- user_agent TEXT
- created_at TIMESTAMP

## security_events
- id UUID PK
- event_type TEXT NOT NULL
- severity TEXT NOT NULL
- ip_address TEXT
- method TEXT
- endpoint TEXT
- user_agent TEXT
- payload_snippet TEXT
- status_code INTEGER
- description TEXT
- request_id TEXT
- created_at TIMESTAMP

Recommended event_type:
- admin_bruteforce_attempt
- sql_injection_attempt
- xss_attempt
- order_enumeration_attempt
- checkout_abuse
- invalid_payment_callback
- unauthorized_admin_access
- sensitive_path_scan
- rate_limit_exceeded
- direct_rds_access_test
