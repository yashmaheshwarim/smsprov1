// ============================================================================
// WhatsApp Manager - TypeScript Types and Interfaces
// ============================================================================

// ============================================================================
// 1. WHATSAPP SESSION TYPES
// ============================================================================

export type WhatsAppSessionStatus = 'active' | 'inactive' | 'pending' | 'disconnected' | 'error';

export interface WhatsAppSession {
  id: string;
  institute_id: string;
  session_id: string;
  phone_number: string | null;
  session_name: string;
  status: WhatsAppSessionStatus;
  qr_code: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  session_name: string;
}

export interface QRCodeResponse {
  qr_code: string;
  session_id: string;
  status: 'pending' | 'scanned' | 'active';
}

// ============================================================================
// 2. WHATSAPP CONTACT TYPES
// ============================================================================

export interface WhatsAppContact {
  id: string;
  institute_id: string;
  name: string;
  phone: string;
  group_name: string | null;
  source: 'manual' | 'imported' | 'sync';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateContactRequest {
  name: string;
  phone: string;
  group_name?: string;
  tags?: string[];
}

export interface BulkImportContactsRequest {
  contacts: CreateContactRequest[];
  file?: File;
}

export interface ContactImportResponse {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

// ============================================================================
// 3. WHATSAPP CONTACT GROUP TYPES
// ============================================================================

export interface WhatsAppContactGroup {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateContactGroupRequest {
  name: string;
  description?: string;
}

// ============================================================================
// 4. WHATSAPP TEMPLATE TYPES
// ============================================================================

export type TemplateCategory = 'greeting' | 'notification' | 'reminder' | 'custom';

export interface TemplateVariable {
  name: string;
  placeholder: string;
  required: boolean;
}

export interface WhatsAppTemplate {
  id: string;
  institute_id: string;
  name: string;
  content: string;
  variables: TemplateVariable[];
  category: TemplateCategory;
  is_approved: boolean;
  meta_template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  content: string;
  variables?: TemplateVariable[];
  category?: TemplateCategory;
}

export interface UpdateTemplateRequest extends Partial<CreateTemplateRequest> {
  id: string;
}

// ============================================================================
// 5. WHATSAPP MESSAGE TYPES
// ============================================================================

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'scheduled';
export type MessageType = 'text' | 'template' | 'bulk';

export interface WhatsAppMessage {
  id: string;
  institute_id: string;
  session_id: string | null;
  recipient_phone: string;
  recipient_name: string | null;
  message_content: string;
  template_id: string | null;
  status: MessageStatus;
  message_type: MessageType;
  external_message_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_reason: string | null;
  media_url: string | null;
  credits_used: number;
  created_at: string;
  updated_at: string;
}

export interface SendMessageRequest {
  recipient_phone: string;
  recipient_name?: string;
  message_content: string;
  template_id?: string;
  media_url?: string;
  scheduled_at?: string;
}

export interface SendBulkMessageRequest {
  recipients: string[]; // phone numbers
  message_content?: string;
  template_id?: string;
  group_name?: string;
  scheduled_at?: string;
}

export interface MessageResponse {
  success: boolean;
  message_id: string;
  status: MessageStatus;
  credits_used: number;
}

// ============================================================================
// 6. WHATSAPP CAMPAIGN TYPES
// ============================================================================

export type CampaignStatus = 'draft' | 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface WhatsAppCampaign {
  id: string;
  institute_id: string;
  session_id: string | null;
  name: string;
  message_content: string | null;
  template_id: string | null;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  recipients: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignRequest {
  name: string;
  message_content?: string;
  template_id?: string;
  recipients: string[];
  scheduled_at?: string;
}

// ============================================================================
// 7. WALLET / CREDIT TYPES
// ============================================================================

export interface Wallet {
  id: string;
  institute_id: string;
  balance: number;
  total_credited: number;
  total_debited: number;
  low_balance_threshold: number;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'credit' | 'debit' | 'refund' | 'adjustment';
export type TransactionReferenceType = 'message' | 'campaign' | 'admin_recharge' | 'other';

export interface WalletTransaction {
  id: string;
  institute_id: string;
  wallet_id: string | null;
  transaction_type: TransactionType;
  credits: number;
  previous_balance: number;
  new_balance: number;
  description: string | null;
  reference_type: TransactionReferenceType;
  reference_id: string | null;
  created_by: string;
  created_at: string;
}

export interface WalletUsageLog {
  id: string;
  institute_id: string;
  message_id: string | null;
  campaign_id: string | null;
  recipient_phone: string;
  credits_used: number;
  message_status: MessageStatus;
  created_at: string;
}

export interface AddCreditsRequest {
  institute_id: string;
  credits: number;
  description: string;
}

export interface DeductCreditsRequest {
  institute_id: string;
  credits: number;
  description: string;
  reference_type?: TransactionReferenceType;
  reference_id?: string;
}

// ============================================================================
// 8. OPENWA API TYPES
// ============================================================================

export interface OpenWAConfig {
  apiUrl: string;
  apiKey?: string;
  webhookUrl: string;
}

export interface OpenWASessionResponse {
  sessionId: string;
  qrCode?: string;
  status: 'pending' | 'authenticated' | 'failed';
  phoneNumber?: string;
}

export interface OpenWAMessageResponse {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
  phoneNumber: string;
  timestamp: string;
}

export interface OpenWAWebhookPayload {
  event: 'message' | 'status' | 'qr' | 'auth';
  sessionId: string;
  data: Record<string, any>;
}

// ============================================================================
// 9. ANALYTICS TYPES
// ============================================================================

export interface WhatsAppAnalytics {
  total_messages: number;
  delivered_messages: number;
  failed_messages: number;
  active_contacts: number;
  success_rate: number;
  messages_today: number;
  messages_this_month: number;
  credits_used_today: number;
  credits_used_this_month: number;
}

export interface MessageStatistics {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  scheduled: number;
}

// ============================================================================
// 10. API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// 11. FILTER & PAGINATION TYPES
// ============================================================================

export interface MessageFilters {
  status?: MessageStatus;
  message_type?: MessageType;
  start_date?: string;
  end_date?: string;
  recipient_phone?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ============================================================================
// 12. FORM STATE TYPES
// ============================================================================

export interface WhatsAppManagerFormState {
  // Connection
  sessionName: string;
  selectedSession: WhatsAppSession | null;
  
  // Contact
  contactName: string;
  contactPhone: string;
  contactGroup: string;
  
  // Template
  templateName: string;
  templateContent: string;
  templateVariables: TemplateVariable[];
  
  // Message
  messageContent: string;
  selectedContacts: string[];
  selectedGroup: string | null;
  scheduledTime: string | null;
  
  // Campaign
  campaignName: string;
  campaignMessage: string;
  campaignScheduled: boolean;
}

// ============================================================================
// 13. UI STATE TYPES
// ============================================================================

export interface LoadingState {
  sessions: boolean;
  contacts: boolean;
  templates: boolean;
  messages: boolean;
  campaigns: boolean;
  wallet: boolean;
  sending: boolean;
  importing: boolean;
}

export interface ErrorState {
  sessions?: string;
  contacts?: string;
  templates?: string;
  messages?: string;
  campaigns?: string;
  wallet?: string;
  sending?: string;
  importing?: string;
}

export interface NotificationState {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

// ============================================================================
// 14. SUPER ADMIN TYPES
// ============================================================================

export interface WalletManagementData {
  institute_id: string;
  institute_name: string;
  current_balance: number;
  total_credited: number;
  total_debited: number;
  usage_today: number;
  usage_this_month: number;
  low_balance_alert: boolean;
}

export interface CreditAllocationRequest {
  institute_id: string;
  credits: number;
  reason: string;
  created_by: string;
}

export interface CreditAuditLog extends WalletTransaction {
  institute_name: string;
  created_by_name: string;
}
