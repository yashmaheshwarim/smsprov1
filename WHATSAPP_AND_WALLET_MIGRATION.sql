-- ============================================================================
-- WhatsApp Manager Module - Database Migration
-- ============================================================================

-- ============================================================================
-- 1. WHATSAPP SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  session_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'inactive', 'pending', 'disconnected', 'error')),
  qr_code TEXT,
  last_activity_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  CONSTRAINT unique_active_session_per_institute UNIQUE(institute_id) WHERE status = 'active'
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_institute_id ON whatsapp_sessions(institute_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);

-- ============================================================================
-- 2. WHATSAPP CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  group_name TEXT,
  source TEXT CHECK (source IN ('manual', 'imported', 'sync')) DEFAULT 'manual',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  CONSTRAINT unique_contact_per_institute UNIQUE(institute_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_institute_id ON whatsapp_contacts(institute_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_group_name ON whatsapp_contacts(group_name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);

-- ============================================================================
-- 3. WHATSAPP CONTACT GROUPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  CONSTRAINT unique_group_per_institute UNIQUE(institute_id, name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_groups_institute_id ON whatsapp_contact_groups(institute_id);

-- ============================================================================
-- 4. WHATSAPP TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  category TEXT CHECK (category IN ('greeting', 'notification', 'reminder', 'custom')) DEFAULT 'custom',
  is_approved BOOLEAN DEFAULT FALSE,
  meta_template_id TEXT,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  CONSTRAINT unique_template_per_institute UNIQUE(institute_id, name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_institute_id ON whatsapp_templates(institute_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_is_approved ON whatsapp_templates(is_approved);

-- ============================================================================
-- 5. WHATSAPP MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  session_id UUID,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  message_content TEXT NOT NULL,
  template_id UUID,
  status TEXT CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'scheduled')) DEFAULT 'pending',
  message_type TEXT CHECK (message_type IN ('text', 'template', 'bulk')) DEFAULT 'text',
  external_message_id TEXT,
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_reason TEXT,
  media_url TEXT,
  credits_used INT DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_institute_id ON whatsapp_messages(institute_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session_id ON whatsapp_messages(session_id);

-- ============================================================================
-- 6. WHATSAPP BULK CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  session_id UUID,
  name TEXT NOT NULL,
  message_content TEXT,
  template_id UUID,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status TEXT CHECK (status IN ('draft', 'pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'draft',
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  recipients JSONB,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_institute_id ON whatsapp_campaigns(institute_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status ON whatsapp_campaigns(status);

-- ============================================================================
-- 7. WALLET TABLES - CREDIT SYSTEM
-- ============================================================================
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL UNIQUE,
  balance INT NOT NULL DEFAULT 0,
  total_credited INT DEFAULT 0,
  total_debited INT DEFAULT 0,
  low_balance_threshold INT DEFAULT 50,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallets_institute_id ON wallets(institute_id);

-- ============================================================================
-- 8. WALLET TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  wallet_id UUID,
  transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit', 'refund', 'adjustment')) NOT NULL,
  credits INT NOT NULL,
  previous_balance INT,
  new_balance INT,
  description TEXT,
  reference_type TEXT CHECK (reference_type IN ('message', 'campaign', 'admin_recharge', 'other')),
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_institute_id ON wallet_transactions(institute_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_transaction_type ON wallet_transactions(transaction_type);

-- ============================================================================
-- 9. WALLET USAGE LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS wallet_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  message_id UUID,
  campaign_id UUID,
  recipient_phone TEXT NOT NULL,
  credits_used INT NOT NULL DEFAULT 1,
  message_status TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_usage_logs_institute_id ON wallet_usage_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_wallet_usage_logs_created_at ON wallet_usage_logs(created_at);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_usage_logs ENABLE ROW LEVEL SECURITY;

-- WhatsApp Sessions RLS
CREATE POLICY whatsapp_sessions_rls_select ON whatsapp_sessions
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY whatsapp_sessions_rls_insert ON whatsapp_sessions
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_sessions_rls_update ON whatsapp_sessions
  FOR UPDATE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_sessions_rls_delete ON whatsapp_sessions
  FOR DELETE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- WhatsApp Contacts RLS
CREATE POLICY whatsapp_contacts_rls_select ON whatsapp_contacts
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY whatsapp_contacts_rls_insert ON whatsapp_contacts
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_contacts_rls_update ON whatsapp_contacts
  FOR UPDATE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_contacts_rls_delete ON whatsapp_contacts
  FOR DELETE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- WhatsApp Templates RLS
CREATE POLICY whatsapp_templates_rls_select ON whatsapp_templates
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY whatsapp_templates_rls_insert ON whatsapp_templates
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_templates_rls_update ON whatsapp_templates
  FOR UPDATE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

CREATE POLICY whatsapp_templates_rls_delete ON whatsapp_templates
  FOR DELETE
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- WhatsApp Messages RLS
CREATE POLICY whatsapp_messages_rls_select ON whatsapp_messages
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY whatsapp_messages_rls_insert ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- Wallet RLS
CREATE POLICY wallets_rls_select ON wallets
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY wallets_rls_update ON wallets
  FOR UPDATE
  USING (
    (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

-- Wallet Transactions RLS
CREATE POLICY wallet_transactions_rls_select ON wallet_transactions
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY wallet_transactions_rls_insert ON wallet_transactions
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- Wallet Usage Logs RLS
CREATE POLICY wallet_usage_logs_rls_select ON wallet_usage_logs
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
    OR (SELECT role FROM auth.users WHERE auth.users.id = auth.uid()) = 'super_admin'
  );

CREATE POLICY wallet_usage_logs_rls_insert ON wallet_usage_logs
  FOR INSERT
  WITH CHECK (
    institute_id = (SELECT institute_id FROM auth.users WHERE auth.users.id = auth.uid())
  );

-- ============================================================================
-- 11. TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_sessions_timestamp BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER whatsapp_contacts_timestamp BEFORE UPDATE ON whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER whatsapp_templates_timestamp BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER whatsapp_messages_timestamp BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER whatsapp_campaigns_timestamp BEFORE UPDATE ON whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER wallets_timestamp BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 12. HELPER FUNCTIONS
-- ============================================================================

-- Function to get wallet balance
CREATE OR REPLACE FUNCTION get_wallet_balance(p_institute_id UUID)
RETURNS INT AS $$
DECLARE
  v_balance INT;
BEGIN
  SELECT balance INTO v_balance FROM wallets WHERE institute_id = p_institute_id;
  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to deduct credits from wallet
CREATE OR REPLACE FUNCTION deduct_wallet_credits(
  p_institute_id UUID,
  p_credits INT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT 'other',
  p_reference_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INT, message TEXT) AS $$
DECLARE
  v_current_balance INT;
  v_wallet_id UUID;
BEGIN
  -- Get wallet
  SELECT id, balance INTO v_wallet_id, v_current_balance FROM wallets WHERE institute_id = p_institute_id;
  
  IF v_wallet_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Wallet not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check balance
  IF v_current_balance < p_credits THEN
    RETURN QUERY SELECT false, v_current_balance, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;
  
  -- Deduct credits
  UPDATE wallets 
  SET balance = balance - p_credits, total_debited = total_debited + p_credits
  WHERE id = v_wallet_id;
  
  -- Create transaction record
  INSERT INTO wallet_transactions 
  (institute_id, wallet_id, transaction_type, credits, previous_balance, new_balance, description, reference_type, reference_id, created_by)
  VALUES 
  (p_institute_id, v_wallet_id, 'debit', p_credits, v_current_balance, v_current_balance - p_credits, p_description, p_reference_type, p_reference_id, auth.uid());
  
  RETURN QUERY SELECT true, (v_current_balance - p_credits), 'Credits deducted successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits to wallet
CREATE OR REPLACE FUNCTION add_wallet_credits(
  p_institute_id UUID,
  p_credits INT,
  p_description TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INT, message TEXT) AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance INT;
BEGIN
  -- Get or create wallet
  SELECT id, balance INTO v_wallet_id, v_current_balance FROM wallets WHERE institute_id = p_institute_id;
  
  IF v_wallet_id IS NULL THEN
    INSERT INTO wallets (institute_id, balance, total_credited)
    VALUES (p_institute_id, p_credits, p_credits)
    RETURNING id, balance INTO v_wallet_id, v_current_balance;
  ELSE
    -- Add credits
    UPDATE wallets 
    SET balance = balance + p_credits, total_credited = total_credited + p_credits
    WHERE id = v_wallet_id;
    v_current_balance := v_current_balance + p_credits;
  END IF;
  
  -- Create transaction record
  INSERT INTO wallet_transactions 
  (institute_id, wallet_id, transaction_type, credits, previous_balance, new_balance, description, reference_type, created_by)
  VALUES 
  (p_institute_id, v_wallet_id, 'credit', p_credits, COALESCE(v_current_balance - p_credits, 0), v_current_balance, p_description, 'admin_recharge', auth.uid());
  
  RETURN QUERY SELECT true, v_current_balance, 'Credits added successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
