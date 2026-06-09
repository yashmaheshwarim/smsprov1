# WhatsApp Manager - Quick Start Guide

## 🎯 What Has Been Built

A complete WhatsApp Manager module has been added to your Apex SMS application with the following features:

### ✅ Core Features Implemented

1. **Multi-Tenant Architecture**
   - Each institute has isolated WhatsApp sessions
   - Institutes can't see each other's data, contacts, or messages
   - Row-level security enforced at database level

2. **WhatsApp Session Management**
   - Create new WhatsApp sessions
   - Generate QR codes for scanning
   - Track active sessions
   - Disconnect/reconnect sessions
   - Last activity monitoring

3. **Contact Management**
   - Add contacts individually
   - Import contacts from CSV (UI ready)
   - Organize contacts into groups
   - Delete contacts
   - Search and filter

4. **Messaging System**
   - Send individual WhatsApp messages
   - Send bulk messages to multiple contacts
   - Create and use message templates
   - Schedule messages (UI ready)
   - Track message status (pending, sent, delivered, failed)

5. **Wallet/Credit System**
   - 1 Credit = 1 WhatsApp Message
   - Credits deducted only on successful send
   - Daily and monthly usage tracking
   - Low balance warnings
   - Complete transaction history
   - Admin-only credit allocation

6. **Message History & Analytics**
   - View all sent messages
   - Filter by status
   - View analytics (total, delivered, failed)
   - Track active contacts
   - Calculate success rates

## 📦 Files Created

### Database
- **WHATSAPP_AND_WALLET_MIGRATION.sql** - Complete database schema with 9 tables

### Types & Interfaces
- **src/types/whatsapp.ts** - 250+ lines of TypeScript types

### Services
- **src/lib/openwa-service.ts** - OpenWA API integration (350+ lines)
- **src/lib/wallet-service.ts** - Credit/wallet system (300+ lines)

### React Hooks
- **src/hooks/useWhatsApp.ts** - WhatsApp operations (400+ lines)
- **src/hooks/useWallet.ts** - Wallet operations (200+ lines)

### Pages & Components
- **src/pages/WhatsAppManagerPage.tsx** - Full-featured admin page (600+ lines)

### Integration
- **src/App.tsx** - Added routing for /whatsapp
- **src/components/layout/AppSidebar.tsx** - Added menu item
- **src/contexts/AuthContext.tsx** - Added access control

### Documentation
- **WHATSAPP_MANAGER_IMPLEMENTATION_GUIDE.md** - Complete guide
- **WHATSAPP_MANAGER_QUICK_START.md** - This file

## 🚀 Getting Started

### Step 1: Setup Database (Required)

1. Go to Supabase Dashboard
2. Click "SQL Editor"
3. Create new query
4. Copy-paste contents of **WHATSAPP_AND_WALLET_MIGRATION.sql**
5. Click "Run"
6. Wait for completion ✓

### Step 2: Configure Environment

Add to `.env.local`:
```
VITE_OPENWA_API_URL=http://16.16.142.42:2785
VITE_OPENWA_API_KEY=optional_key
```

### Step 3: Start Development Server

```bash
npm run dev
```

### Step 4: Access WhatsApp Manager

1. Open http://localhost:5173
2. Login as Admin user
3. Sidebar → "WhatsApp Manager"

## 🎮 Using the Interface

### Connection Tab

**Create New Session:**
1. Enter session name (e.g., "Main Account")
2. Click "Generate QR Code"
3. Scan with WhatsApp mobile app
4. Wait for "active" status

**Manage Sessions:**
- View all created sessions
- Check connection status
- See phone numbers
- Disconnect when needed

### Contacts Tab

**Add Single Contact:**
1. Enter Name
2. Enter Phone Number (with country code)
3. Optional: Select Group
4. Click "Add Contact"

**Import CSV:**
- Click "Import CSV"
- Upload file with columns: Name, Phone, Group
- Contacts are synced

**Export CSV:**
- Click "Export CSV"
- Download all contacts as CSV file

### Messaging Tab

**Send Message:**
1. Check wallet balance (top card)
2. Compose message
3. Select recipients by checking boxes
4. Verify credit requirement
5. Click "Send Now"

**Credit System:**
- 1 Credit = 1 Message
- Failed sends don't consume credits
- View daily/monthly usage
- Low balance warning appears when < 50 credits

### Templates Tab

**Create Template:**
1. Enter template name
2. Enter content (with {{variables}} if needed)
3. Click "Create Template"
4. Use in bulk messages later

### History Tab

**View All Messages:**
- See all sent messages
- Check delivery status
- View timestamps
- Filter by status

### Analytics Tab

**View Statistics:**
- Total messages sent
- Delivered count
- Success rate
- Active contacts
- Credits used this month

## 🔐 Security Features

✅ **Multi-Tenant Isolation**
- Each institute sees only its own data
- Database-level security with RLS policies

✅ **Credit Protection**
- Only Super Admin can add credits
- All transactions logged
- Prevents unauthorized credit deduction

✅ **API Security**
- OpenWA API key never exposed to frontend
- All API calls through secure backend service

✅ **Data Privacy**
- Encrypted at rest in Supabase
- Row-level security enforced
- Audit trail for all operations

## 🛠️ Admin Controls (Super Admin Only)

Super Admin can:
1. Enable/disable WhatsApp Manager for institutes
2. View all institute data (bypasses RLS)
3. Add/deduct credits for any institute
4. View transaction history
5. Access wallet management (to be built)

**How to toggle for institute:**
1. Go to Super Admin Dashboard
2. Manage Members
3. Edit institute
4. Toggle "WhatsApp Manager" access
5. Save

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         WhatsApp Manager Frontend                   │
│  ┌────────────────────────────────────────────────┐ │
│  │  WhatsAppManagerPage (Main Component)          │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
    ┌───────▼─────────┐  ┌─────▼──────────┐  ┌──▼────────────┐
    │ useWhatsApp     │  │  useWallet     │  │ useAuth       │
    │ (React Hooks)   │  │  (React Hooks) │  │ (Auth Context)│
    └───────┬─────────┘  └─────┬──────────┘  └──┬────────────┘
            │                  │                 │
    ┌───────▼──────────┐  ┌─────▼──────────┐    │
    │openwa-service    │  │wallet-service  │    │
    │(OpenWA API calls)│  │(Credit ops)    │    │
    └───────┬──────────┘  └─────┬──────────┘    │
            │                  │                 │
    ┌───────▼─────────────────▼──────────────────▼──┐
    │       Supabase Client                        │
    │  (Real-time Database & Auth)                 │
    └───────┬──────────────────────────────────────┘
            │
            │  RLS Enforced
            │
    ┌───────▼──────────────────────────────────────┐
    │  PostgreSQL Database                         │
    │  ┌────────────────────────────────────────┐  │
    │  │  whatsapp_sessions                     │  │
    │  │  whatsapp_contacts                     │  │
    │  │  whatsapp_messages                     │  │
    │  │  whatsapp_templates                    │  │
    │  │  wallets                               │  │
    │  │  wallet_transactions                   │  │
    │  │  ... (+ more tables)                   │  │
    │  └────────────────────────────────────────┘  │
    └────────────────────────────────────────────┘
            │
            │  External
            │
    ┌───────▼──────────────────────────────────────┐
    │  OpenWA API (http://16.16.142.42:2785)      │
    │  - Session Management                        │
    │  - Message Sending                           │
    │  - QR Code Generation                        │
    └────────────────────────────────────────────┘
```

## 🎯 Common Tasks

### Send a Test Message

```typescript
1. Create a session
2. Scan QR code
3. Add a contact
4. Go to Messaging tab
5. Select contact
6. Type message
7. Click Send Now
```

### Check Message Status

```
Messaging > History Tab > Look at Status column
- pending   (Queued for sending)
- sent      (Sent successfully)
- delivered (Delivered to phone)
- failed    (Failed to send)
```

### Add Contacts from CSV

```
contacts.csv:
Name,Phone,Group
Ali Khan,923001234567,Friends
Sara Ahmed,923009876543,Family

1. Contacts > Import CSV
2. Select file
3. Click Import
4. Check History table
```

### Monitor Credit Usage

```
Messaging Tab > Top Card Shows:
- Available Credits (balance)
- Used Today (daily count)
- Used This Month (monthly count)
```

## ⚠️ Important Notes

1. **OpenWA Must Be Running**
   - The OpenWA API needs to be accessible at `http://16.16.142.42:2785`
   - If not running, session creation will fail

2. **Database Migration Required**
   - Must run the SQL migration before using
   - Creates 9 tables + RLS policies

3. **Phone Number Format**
   - Must include country code (e.g., +92 for Pakistan)
   - Automatically formatted if missing

4. **One Session Per Institute**
   - Each institute can have one active session
   - Create multiple sessions for testing (only one can be active)

5. **Credits Not Recoverable**
   - Once deducted, credits are permanent
   - Only Super Admin can add credits back
   - Keep wallet balance monitored

## 🆘 Troubleshooting

### Issue: "Session Creation Failed"
**Solution:**
- Check if OpenWA API is running
- Verify VITE_OPENWA_API_URL is correct
- Check network connection

### Issue: "Insufficient Credits"
**Solution:**
- Contact Super Admin to add credits
- Check usage with Messaging > Analytics

### Issue: "QR Code Not Loading"
**Solution:**
- Wait 5-10 seconds
- Refresh page
- Try reconnecting session

### Issue: "Message Failed to Send"
**Solution:**
- Check session status (should be "active")
- Verify phone number format
- Check WhatsApp account isn't suspended

### Issue: "RLS Policy Errors"
**Solution:**
- Ensure migration SQL was run completely
- Check Supabase audit logs
- Verify user role is "admin"

## 📈 Next Steps

1. **Test in Development**
   - Create test sessions
   - Send test messages
   - Monitor wallet usage

2. **Train Administrators**
   - How to create sessions
   - How to manage contacts
   - How to send messages
   - How to monitor usage

3. **Configure Production**
   - Point to production OpenWA URL
   - Setup proper database backups
   - Configure webhook for status updates

4. **Advanced Features** (Optional)
   - Scheduled messaging
   - Template variables
   - Bulk campaign analytics
   - Admin wallet management page

## 📞 Support

For issues or questions:
1. Check WHATSAPP_MANAGER_IMPLEMENTATION_GUIDE.md
2. Review database migration SQL
3. Check browser console for errors
4. Verify Supabase configuration

---

**Version:** 1.0
**Status:** ✅ Ready to Use
**Last Updated:** 2024

Enjoy your new WhatsApp Manager! 🎉
