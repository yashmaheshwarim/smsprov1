# WhatsApp Manager - API Reference Guide

## 📚 Complete API Documentation

### Table of Contents
1. [OpenWA Service](#openwa-service)
2. [Wallet Service](#wallet-service)
3. [WhatsApp React Hooks](#whatsapp-react-hooks)
4. [Wallet React Hooks](#wallet-react-hooks)
5. [Type Definitions](#type-definitions)
6. [Database Functions](#database-functions)

---

## OpenWA Service

**File:** `src/lib/openwa-service.ts`

OpenWA service for backend integration with the OpenWA API.

### Usage

```typescript
import { getOpenWAService } from '@/lib/openwa-service';

const service = getOpenWAService();
// Or with custom config
const service = getOpenWAService({ 
  apiUrl: 'http://custom-url:2785',
  apiKey: 'optional_key'
});
```

### Methods

#### createSession(instituteId: string, sessionName: string): Promise<WhatsAppSession>

Create a new WhatsApp session.

```typescript
const session = await service.createSession('institute-uuid', 'My Session');
// Returns:
// {
//   id: 'session-uuid',
//   institute_id: 'institute-uuid',
//   session_id: 'unique-session-id',
//   session_name: 'My Session',
//   status: 'pending',
//   qr_code: null,
//   ...
// }
```

**Parameters:**
- `instituteId` (string) - UUID of the institute
- `sessionName` (string) - Name for the session

**Returns:** Promise<WhatsAppSession>

**Throws:** Error if creation fails

---

#### getQRCode(sessionId: string): Promise<QRCodeResponse>

Get QR code for a session.

```typescript
const qr = await service.getQRCode('session-id-123');
// Returns:
// {
//   qr_code: 'base64-encoded-png',
//   session_id: 'session-id-123',
//   status: 'pending'
// }
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<QRCodeResponse> with base64 QR code

**Throws:** Error if QR code generation fails

---

#### getSessionStatus(sessionId: string): Promise<WhatsAppSession | null>

Get current session status and update database.

```typescript
const session = await service.getSessionStatus('session-id-123');
// Returns updated session with latest status
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<WhatsAppSession | null>

---

#### disconnectSession(sessionId: string): Promise<boolean>

Disconnect an active session.

```typescript
const success = await service.disconnectSession('session-id-123');
// Updates session status to 'disconnected'
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<boolean>

---

#### reconnectSession(sessionId: string): Promise<QRCodeResponse>

Reconnect a disconnected session with new QR code.

```typescript
const qr = await service.reconnectSession('session-id-123');
// Returns new QR code
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<QRCodeResponse>

---

#### sendMessage(sessionId: string, request: SendMessageRequest): Promise<MessageResponse>

Send a single WhatsApp message.

```typescript
const result = await service.sendMessage('session-id-123', {
  recipient_phone: '+923001234567',
  recipient_name: 'Ali Khan',
  message_content: 'Hello World!',
  media_url: 'https://example.com/image.png' // optional
});
// Returns:
// {
//   success: true,
//   message_id: 'msg-uuid',
//   status: 'sent',
//   credits_used: 1
// }
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID
- `request` (SendMessageRequest)
  - `recipient_phone` (string) - Phone number with country code
  - `recipient_name` (string, optional) - Recipient name
  - `message_content` (string) - Message text
  - `media_url` (string, optional) - Media attachment URL
  - `scheduled_at` (string, optional) - ISO timestamp for scheduling

**Returns:** Promise<MessageResponse>

---

#### sendBulkMessages(sessionId: string, request: SendBulkMessageRequest): Promise<MessageResponse>

Send messages to multiple recipients.

```typescript
const result = await service.sendBulkMessages('session-id-123', {
  recipients: ['+923001111111', '+923002222222', '+923003333333'],
  message_content: 'Hello Everyone!',
  scheduled_at: '2024-01-15T10:30:00Z' // optional
});
// Returns:
// {
//   success: true,
//   message_id: 'campaign-uuid',
//   status: 'pending',
//   credits_used: 3
// }
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID
- `request` (SendBulkMessageRequest)
  - `recipients` (string[]) - Array of phone numbers
  - `message_content` (string, optional) - Message text
  - `template_id` (string, optional) - Template UUID
  - `group_name` (string, optional) - Contact group
  - `scheduled_at` (string, optional) - ISO timestamp

**Returns:** Promise<MessageResponse>

---

#### sendTemplate(sessionId: string, recipientPhone: string, templateName: string, variables: Record<string, string>): Promise<MessageResponse>

Send a pre-approved WhatsApp template.

```typescript
const result = await service.sendTemplate(
  'session-id-123',
  '+923001234567',
  'order_confirmation',
  { orderId: '12345', amount: '5000' }
);
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID
- `recipientPhone` (string) - Recipient phone number
- `templateName` (string) - Meta template name
- `variables` (Record<string, string>) - Template variables

**Returns:** Promise<MessageResponse>

---

#### getSessionContacts(sessionId: string): Promise<Record<string, any>[]>

Get all contacts from WhatsApp session.

```typescript
const contacts = await service.getSessionContacts('session-id-123');
// Returns array of contact objects
```

**Parameters:**
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<Record<string, any>[]>

---

#### syncContacts(instituteId: string, sessionId: string): Promise<{ synced: number; failed: number }>

Sync WhatsApp contacts to database.

```typescript
const result = await service.syncContacts('institute-uuid', 'session-id-123');
// Returns: { synced: 45, failed: 2 }
```

**Parameters:**
- `instituteId` (string) - Institute UUID
- `sessionId` (string) - OpenWA session ID

**Returns:** Promise<{ synced: number; failed: number }>

---

#### healthCheck(): Promise<boolean>

Check if OpenWA API is accessible.

```typescript
const isHealthy = await service.healthCheck();
```

**Returns:** Promise<boolean>

---

#### setConfig(config: Partial<OpenWAServiceConfig>): void

Update service configuration.

```typescript
service.setConfig({
  apiUrl: 'http://new-api:2785',
  apiKey: 'new-key'
});
```

---

## Wallet Service

**File:** `src/lib/wallet-service.ts`

Credit wallet management system.

### Usage

```typescript
import { getWalletService } from '@/lib/wallet-service';

const wallet = getWalletService();
```

### Methods

#### getOrCreateWallet(instituteId: string): Promise<Wallet>

Get existing wallet or create new one.

```typescript
const wallet = await wallet.getOrCreateWallet('institute-uuid');
// Returns:
// {
//   id: 'wallet-uuid',
//   institute_id: 'institute-uuid',
//   balance: 1000,
//   total_credited: 5000,
//   total_debited: 4000,
//   low_balance_threshold: 50,
//   created_at: '2024-01-01T00:00:00Z',
//   updated_at: '2024-01-15T10:30:00Z'
// }
```

**Returns:** Promise<Wallet>

---

#### getBalance(instituteId: string): Promise<number>

Get current wallet balance.

```typescript
const balance = await wallet.getBalance('institute-uuid');
// Returns: 1000 (number of credits)
```

**Returns:** Promise<number>

---

#### hasEnoughCredits(instituteId: string, requiredCredits: number): Promise<boolean>

Check if institute has enough credits.

```typescript
const hasEnough = await wallet.hasEnoughCredits('institute-uuid', 100);
// Returns: true or false
```

**Returns:** Promise<boolean>

---

#### deductCredits(instituteId: string, credits: number, description: string, referenceType?: string, referenceId?: string): Promise<{ success: boolean; newBalance: number; message: string }>

Deduct credits from wallet.

```typescript
const result = await wallet.deductCredits(
  'institute-uuid',
  10,
  'Bulk message campaign',
  'campaign',
  'campaign-uuid'
);
// Returns:
// {
//   success: true,
//   newBalance: 990,
//   message: 'Credits deducted successfully'
// }
// or
// {
//   success: false,
//   newBalance: 1000,
//   message: 'Insufficient credits'
// }
```

**Parameters:**
- `instituteId` (string) - Institute UUID
- `credits` (number) - Credits to deduct
- `description` (string) - Transaction description
- `referenceType` (string, optional) - 'message', 'campaign', 'other'
- `referenceId` (string, optional) - Reference UUID

**Returns:** Promise with success status and new balance

---

#### addCredits(instituteId: string, credits: number, description: string): Promise<{ success: boolean; newBalance: number; message: string }>

Add credits to wallet (Admin only).

```typescript
const result = await wallet.addCredits(
  'institute-uuid',
  1000,
  'Monthly recharge'
);
```

**Returns:** Promise with success status and new balance

---

#### logUsage(instituteId: string, messageId: string, recipientPhone: string, creditsUsed: number, messageStatus: string): Promise<WalletUsageLog>

Log message usage for analytics.

```typescript
const log = await wallet.logUsage(
  'institute-uuid',
  'message-uuid',
  '+923001234567',
  1,
  'delivered'
);
```

**Returns:** Promise<WalletUsageLog>

---

#### getTransactionHistory(instituteId: string, limit?: number, offset?: number): Promise<WalletTransaction[]>

Get transaction history with pagination.

```typescript
const transactions = await wallet.getTransactionHistory(
  'institute-uuid',
  50,  // limit
  0    // offset
);
```

**Returns:** Promise<WalletTransaction[]>

---

#### getUsageStats(instituteId: string, days?: number): Promise<{ total_used: number; daily_breakdown: Record<string, number>; entries_count: number }>

Get usage statistics for a period.

```typescript
const stats = await wallet.getUsageStats('institute-uuid', 30);
// Returns:
// {
//   total_used: 250,
//   daily_breakdown: { '2024-01-15': 50, '2024-01-14': 45, ... },
//   entries_count: 100
// }
```

**Returns:** Promise with usage statistics

---

#### getDailyUsage(instituteId: string): Promise<number>

Get today's credit usage.

```typescript
const dailyUsed = await wallet.getDailyUsage('institute-uuid');
// Returns: 45 (credits used today)
```

**Returns:** Promise<number>

---

#### getMonthlyUsage(instituteId: string): Promise<number>

Get this month's credit usage.

```typescript
const monthlyUsed = await wallet.getMonthlyUsage('institute-uuid');
// Returns: 850 (credits used this month)
```

**Returns:** Promise<number>

---

#### refundCredits(instituteId: string, credits: number, reason: string): Promise<{ success: boolean; newBalance: number }>

Refund credits for failed messages.

```typescript
const result = await wallet.refundCredits(
  'institute-uuid',
  10,
  'Failed message batch'
);
```

**Returns:** Promise with success status and new balance

---

## WhatsApp React Hooks

**File:** `src/hooks/useWhatsApp.ts`

### useWhatsAppSessions

Manage WhatsApp sessions.

```typescript
const {
  sessions,           // WhatsAppSession[]
  activeSession,      // WhatsAppSession | null
  loading,            // boolean
  error,              // string | null
  fetchSessions,      // () => Promise<void>
  createSession,      // (name: string) => Promise<WhatsAppSession>
  getQRCode,          // (sessionId: string) => Promise<QRCodeResponse>
  disconnectSession,  // (sessionId: string) => Promise<void>
  reconnectSession    // (sessionId: string) => Promise<QRCodeResponse>
} = useWhatsAppSessions(instituteId);
```

**Example:**

```typescript
const { activeSession, createSession, getQRCode, loading } = useWhatsAppSessions(instituteId);

// Create session
const session = await createSession('Main Account');

// Get QR code
const qr = await getQRCode(session.session_id);
console.log(qr.qr_code); // base64 image
```

---

### useWhatsAppContacts

Manage WhatsApp contacts.

```typescript
const {
  contacts,        // WhatsAppContact[]
  loading,         // boolean
  error,           // string | null
  fetchContacts,   // (filters?: {...}) => Promise<void>
  addContact,      // (request: CreateContactRequest) => Promise<WhatsAppContact>
  deleteContact,   // (contactId: string) => Promise<void>
  importContacts   // (file: File) => Promise<{success: boolean; count: number}>
} = useWhatsAppContacts(instituteId);
```

**Example:**

```typescript
const { contacts, addContact, deleteContact } = useWhatsAppContacts(instituteId);

// Add contact
await addContact({
  name: 'Ali Khan',
  phone: '+923001234567',
  group_name: 'Friends'
});

// Delete contact
await deleteContact(contactId);

// Import CSV
await importContacts(csvFile);
```

---

### useWhatsAppTemplates

Manage message templates.

```typescript
const {
  templates,       // WhatsAppTemplate[]
  loading,         // boolean
  error,           // string | null
  fetchTemplates,  // () => Promise<void>
  createTemplate,  // (request: CreateTemplateRequest) => Promise<WhatsAppTemplate>
  deleteTemplate   // (templateId: string) => Promise<void>
} = useWhatsAppTemplates(instituteId);
```

**Example:**

```typescript
const { templates, createTemplate } = useWhatsAppTemplates(instituteId);

await createTemplate({
  name: 'Welcome',
  content: 'Hi {{name}}, welcome to our service!',
  variables: [
    { name: 'name', placeholder: '{{name}}', required: true }
  ],
  category: 'greeting'
});
```

---

### useWhatsAppMessages

Send and manage messages.

```typescript
const {
  messages,      // WhatsAppMessage[]
  loading,       // boolean
  error,         // string | null
  fetchMessages, // (filters?: {...}, pagination?: {...}) => Promise<void>
  sendMessage    // (sessionId: string, request: SendMessageRequest) => Promise<MessageResponse>
} = useWhatsAppMessages(instituteId);
```

**Example:**

```typescript
const { sendMessage } = useWhatsAppMessages(instituteId);

const result = await sendMessage(sessionId, {
  recipient_phone: '+923001234567',
  recipient_name: 'Ali',
  message_content: 'Hello!'
});

console.log(result.credits_used); // 1
```

---

### useWhatsAppCampaigns

Manage bulk campaigns.

```typescript
const {
  campaigns,       // WhatsAppCampaign[]
  loading,         // boolean
  error,           // string | null
  fetchCampaigns   // () => Promise<void>
} = useWhatsAppCampaigns(instituteId);
```

---

## Wallet React Hooks

**File:** `src/hooks/useWallet.ts`

### useWallet

Main wallet hook for balance and operations.

```typescript
const {
  wallet,         // Wallet | null
  balance,        // number
  loading,        // boolean
  error,          // string | null
  fetchWallet,    // () => Promise<void>
  deductCredits,  // (credits, desc, type?, id?) => Promise<{success, newBalance, message}>
  addCredits,     // (credits, desc) => Promise<{success, newBalance, message}>
  refundCredits   // (credits, reason) => Promise<{success, newBalance}>
} = useWallet(instituteId);
```

**Example:**

```typescript
const { balance, deductCredits, loading } = useWallet(instituteId);

// Check balance
console.log(balance); // 1000

// Deduct credits
const result = await deductCredits(
  100,
  'Bulk message',
  'campaign',
  campaignId
);

if (result.success) {
  console.log('New balance:', result.newBalance);
}
```

---

### useWalletTransactions

View transaction history.

```typescript
const {
  transactions,      // WalletTransaction[]
  loading,           // boolean
  error,             // string | null
  fetchTransactions  // (limit?, offset?) => Promise<void>
} = useWalletTransactions(instituteId);
```

---

### useWalletAnalytics

Get wallet usage analytics.

```typescript
const {
  dailyUsage,    // number
  monthlyUsage,  // number
  stats,         // {total_used, daily_breakdown, entries_count}
  loading,       // boolean
  error,         // string | null
  fetchAnalytics // (days?) => Promise<void>
} = useWalletAnalytics(instituteId);
```

---

### useWalletCheck

Pre-send credit verification.

```typescript
const {
  hasEnoughCredits,  // boolean
  requiredCredits,   // number
  loading,           // boolean
  checkCredits       // (credits: number) => Promise<boolean>
} = useWalletCheck(instituteId);
```

**Example:**

```typescript
const { checkCredits, hasEnoughCredits } = useWalletCheck(instituteId);

const hasEnough = await checkCredits(100);
if (!hasEnough) {
  toast('Insufficient credits!');
}
```

---

## Type Definitions

**File:** `src/types/whatsapp.ts`

### Main Types

```typescript
// Session
type WhatsAppSessionStatus = 'active' | 'inactive' | 'pending' | 'disconnected' | 'error';
interface WhatsAppSession { ... }

// Contact
interface WhatsAppContact { ... }
interface CreateContactRequest { ... }

// Template
interface WhatsAppTemplate { ... }
type TemplateCategory = 'greeting' | 'notification' | 'reminder' | 'custom';

// Message
type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'scheduled';
interface WhatsAppMessage { ... }
interface SendMessageRequest { ... }

// Campaign
type CampaignStatus = 'draft' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
interface WhatsAppCampaign { ... }

// Wallet
interface Wallet { ... }
interface WalletTransaction { ... }
type TransactionType = 'credit' | 'debit' | 'refund' | 'adjustment';
```

---

## Database Functions

**File:** `WHATSAPP_AND_WALLET_MIGRATION.sql`

### SQL Helper Functions

#### get_wallet_balance(p_institute_id UUID) → INT

Get wallet balance for an institute.

```sql
SELECT get_wallet_balance('institute-uuid'::uuid);
-- Returns: 1000
```

---

#### deduct_wallet_credits(...)

Deduct credits and create transaction (also available as Postgres function).

```sql
SELECT * FROM deduct_wallet_credits(
  'institute-uuid'::uuid,
  10,
  'Bulk message',
  'campaign',
  'campaign-uuid'::uuid
);
-- Returns: (success BOOLEAN, new_balance INT, message TEXT)
```

---

#### add_wallet_credits(...)

Add credits to wallet (also available as Postgres function).

```sql
SELECT * FROM add_wallet_credits(
  'institute-uuid'::uuid,
  100,
  'Monthly recharge'
);
```

---

## Complete Example

### Full Workflow: Send Message

```typescript
import { useWhatsAppSessions, useWhatsAppMessages, useWhatsAppContacts } from '@/hooks/useWhatsApp';
import { useWallet } from '@/hooks/useWallet';

function SendMessageWorkflow() {
  const { activeSession } = useWhatsAppSessions(instituteId);
  const { contacts } = useWhatsAppContacts(instituteId);
  const { sendMessage } = useWhatsAppMessages(instituteId);
  const { balance, deductCredits } = useWallet(instituteId);

  const handleSendMessage = async () => {
    // 1. Check if session is active
    if (!activeSession || activeSession.status !== 'active') {
      toast('WhatsApp session not connected');
      return;
    }

    // 2. Check balance
    if (balance < selectedContacts.length) {
      toast('Insufficient credits');
      return;
    }

    // 3. Send message
    for (const contactId of selectedContacts) {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) continue;

      const result = await sendMessage(activeSession.session_id, {
        recipient_phone: contact.phone,
        recipient_name: contact.name,
        message_content: messageText
      });

      // 4. If successful, deduct credits
      if (result.success) {
        await deductCredits(
          result.credits_used,
          `Message to ${contact.name}`,
          'message',
          contact.id
        );
      }
    }

    toast('Messages sent!');
  };

  return <button onClick={handleSendMessage}>Send</button>;
}
```

---

## Error Handling

### Common Errors

```typescript
try {
  await service.createSession(instituteId, name);
} catch (error) {
  if (error.message.includes('OpenWA')) {
    // OpenWA API not responding
    toast('WhatsApp service unavailable');
  } else if (error.message.includes('Network')) {
    // Network error
    toast('Network connection failed');
  }
}
```

---

## Best Practices

1. **Always check balance before sending**
   ```typescript
   const hasEnough = await wallet.hasEnoughCredits(instituteId, count);
   ```

2. **Handle failed messages gracefully**
   ```typescript
   if (!result.success) {
     await wallet.refundCredits(instituteId, credits, 'Failed send');
   }
   ```

3. **Use proper error boundaries**
   ```typescript
   const { error, loading } = useWhatsAppSessions(instituteId);
   if (error) return <ErrorComponent error={error} />;
   ```

4. **Cache data appropriately**
   ```typescript
   const { sessions, fetchSessions } = useWhatsAppSessions(instituteId);
   // fetchSessions is called automatically on mount
   ```

5. **Log important operations**
   ```typescript
   console.log('Sending message to', phone, 'Credits:', creditsUsed);
   ```

---

**API Version:** 1.0
**Last Updated:** 2024
**Status:** ✅ Complete

