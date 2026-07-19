# Apex SMS - Mobile App

Cross-platform mobile application for Apex Student Management System, built with Expo (React Native).

## 🚀 Quick Start

```bash
# Install dependencies
cd "Mobile App"
npm install

# Start the Expo development server
npx expo start

# Run on Android
npx expo start --android

# Run on iOS
npx expo start --ios

# Run in web browser
npx expo start --web
```

## 📋 Prerequisites

1. **Node.js** 18+ and **npm** installed
2. **Expo Go** app on your phone (for testing)
3. **Supabase** project configured with the same database as the web app

## 🔧 Environment Setup

Create a `.env` file in the Mobile App directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Or set these in `app.json` under `expo.extra`.

## 🗄️ Backend API Setup (Supabase)

The mobile app requires the following Supabase tables. Most already exist from the web app migrations.

### ✅ Existing Tables (Already Set Up)

These tables are already created by existing migrations and are fully functional:

| Table | Purpose |
|-------|---------|
| `institutes` | Multi-tenant institute management |
| `students` | Student profiles, enrollment, batches |
| `teachers` | Teacher profiles, subjects, permissions |
| `batches` | Batch/class management |
| `attendance` | Daily attendance tracking |
| `invoices` | Fee invoices and payment records |
| `student_fees` | Per-student fee breakdown |
| `batch_fees` | Batch-level fee structures |
| `marks` | Exam marks and grading |
| `inquiries` | Admission inquiries/leads |
| `leave_requests` | Teacher leave management |
| `message_queue` | Rate-limited message sending queue |
| `wallet_transactions` | Credit/debit transaction audit trail |

### 🆕 New Tables (Events & Institute Config)

The `events` and `institute_config` tables are needed for the Calendar and WhatsApp features.

**Migration file:** `supabase/migrations/20260714000000_create_events_and_config.sql`

#### Apply the migration:

**Option A — Supabase Dashboard (Recommended):**
1. Go to [Supabase Dashboard](https://supabase.com) → **SQL Editor**
2. Open the file `supabase/migrations/20260714000000_create_events_and_config.sql`
3. Copy and paste the entire contents into the SQL Editor
4. Click **Run**
5. Refresh schema cache: Go to **Database → Tables** → Click **...** → **Refresh schema cache**

**Option B — Supabase CLI:**
```bash
npx supabase migration up
```

#### Table: `events`

```sql
-- Stores academic calendar events
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,          -- Event title/name
    date DATE NOT NULL,           -- Event date
    type TEXT NOT NULL DEFAULT 'event'
        CHECK (type IN ('event', 'holiday', 'exam', 'parent_meeting')),
    time TEXT,                    -- Optional time (e.g. "10:00 AM")
    location TEXT,                -- Optional location (e.g. "Room 101")
    comments TEXT,                -- Additional notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

**Event types:**
| Type | Icon | Color | Description |
|------|------|-------|-------------|
| `event` | 🎉 | Indigo | General academic events |
| `holiday` | 🎉 | Red | Holidays / no-class days |
| `exam` | 📝 | Amber | Exam schedules |
| `parent_meeting` | 👥 | Green | Parent-teacher meetings |

**Query examples:**
```sql
-- Get all events for a month
SELECT * FROM public.events 
WHERE institute_id = '<institute_uuid>'
  AND date >= '2026-07-01'
  AND date <= '2026-07-31'
ORDER BY date;

-- Get today's events
SELECT * FROM public.events 
WHERE institute_id = '<institute_uuid>'
  AND date = CURRENT_DATE
ORDER BY time;
```

#### Table: `institute_config`

```sql
-- Stores per-institute settings (key-value pattern)
CREATE TABLE public.institute_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(institute_id, config_key)
);
```

**Config keys:**
| Key | Purpose | Default Value |
|-----|---------|---------------|
| `whatsapp_settings` | WhatsApp connection & preferences | `{"whatsapp_connected": false, "auto_absent_alerts": true, "auto_fee_reminders": false}` |
| `notification_prefs` | Push/email notification settings | `{"email_alerts": true, "push_enabled": true}` |

**Query examples:**
```sql
-- Get WhatsApp config for an institute
SELECT config_value FROM public.institute_config 
WHERE institute_id = '<uuid>' AND config_key = 'whatsapp_settings';

-- Check if connected
SELECT config_value->>'whatsapp_connected' AS is_connected 
FROM public.institute_config 
WHERE institute_id = '<uuid>' AND config_key = 'whatsapp_settings';

-- Update WhatsApp connection status
INSERT INTO public.institute_config (institute_id, config_key, config_value)
VALUES ('<uuid>', 'whatsapp_settings', 
        '{"whatsapp_connected": true, "auto_absent_alerts": true, "auto_fee_reminders": false}')
ON CONFLICT (institute_id, config_key) 
DO UPDATE SET 
    config_value = EXCLUDED.config_value, 
    updated_at = timezone('utc', now());
```

### 📬 Message Queue System

For WhatsApp/SMS messaging, the mobile app uses the `message_queue` table for rate-limited sending:

```sql
-- Queue a message for sending
INSERT INTO public.message_queue (
    institute_id, recipient, recipient_name, message, channel
) VALUES (
    '<institute_uuid>', '+919876543210', 'Parent Name', 
    'Your ward was marked absent today.', 'whatsapp'
);

-- Process pending messages (run every 5 seconds via cron)
SELECT * FROM public.message_queue 
WHERE status = 'pending' 
  AND (scheduled_at IS NULL OR scheduled_at <= now())
ORDER BY priority DESC, created_at ASC 
LIMIT 10;
```

**Channel types:** `whatsapp`, `sms`, `email`
**Priority levels:** `high`, `normal`, `low`
**Statuses:** `pending`, `sending`, `sent`, `failed`

### 🔐 Row Level Security (RLS)

All tables have RLS enabled. For development, permissive policies allow all operations (`USING (true)`). For production, restrict policies to authenticated users:

```sql
-- Example production policy
CREATE POLICY "Users can only access their institute data" ON public.students
    FOR ALL
    USING (institute_id IN (
        SELECT institute_id FROM public.users WHERE id = auth.uid()
    ));
```

## 🏗️ Project Structure

```
Mobile App/
├── App.tsx                    # Entry point with role-based routing
├── src/
│   ├── components/
│   │   ├── AdBanner.tsx       # Google AdMob banner component
│   │   ├── StatCard.tsx       # Reusable statistics card
│   │   └── StatusBadge.tsx    # Status indicator badge
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication & role management
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client
│   │   ├── types.ts           # TypeScript type definitions
│   │   └── utils.ts           # Utility functions
│   └── screens/
│       ├── LoginScreen.tsx    # Login with Google Ads banner
│       ├── admin/             # Admin role screens
│       ├── teacher/           # Teacher role screens
│       ├── student/           # Student role screens
│       ├── parent/            # Parent role screens
│       └── super-admin/       # Super Admin role screens
└── package.json
```

## 👥 Role-Based Access

| Role | Screens |
|------|---------|
| **Super Admin** | Dashboard, Analytics, Revenue, Wallet, Members |
| **Admin** | Dashboard, Students, Attendance, Fees, Marks, Batches, Admissions, Teachers, WhatsApp, Calendar, Settings |
| **Teacher** | Dashboard, Attendance, Marks, Leaves |
| **Student** | Dashboard, Attendance, Fees, Marks |
| **Parent** | Dashboard, Attendance, Fees, Marks |

## 📱 Test Credentials

These credentials work if the corresponding records exist in your database.

| Role | Email / Enrollment | Password |
|------|-------------------|----------|
| Super Admin | superadmin@maheshwaritech.com | super123 |
| Admin | admin@institute.com (or institute email) | admin123 (or institute password) |
| Teacher | rajesh@institute.com (or teacher email) | teacher123 (or teacher password) |
| Student | aarav@student.com (or enrollment no) | student123 |
| Parent | parent@institute.com | parent123 |

> **Note:** The test credentials section is no longer shown on the login screen. Users should obtain their credentials from their institute admin.

## 📢 Google AdMob

The login screen includes a horizontal Google Ads banner at the top. For production:

1. Replace the test ad unit IDs in `LoginScreen.tsx` and `AdBanner.tsx`
2. Update `app.json` with your `googleMobileAdsAppId`
3. Test with: `ca-app-pub-3940256099942544/6300978111` (Android test)

## 🚀 Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

## 🛠️ Built With

- [Expo](https://expo.dev/) - Cross-platform development
- [React Native](https://reactnative.dev/) - Mobile framework
- [Supabase](https://supabase.com/) - Backend & database
- [React Navigation](https://reactnavigation.org/) - Navigation
- [Expo AdMob](https://docs.expo.dev/versions/latest/sdk/admob/) - Google Ads

## 📄 License

© Maheshwari Tech
