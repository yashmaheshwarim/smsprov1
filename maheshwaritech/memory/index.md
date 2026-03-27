Apex SMS design system and architecture notes for Maheshwari Tech multi-tenant SaaS platform.

## Design System
- Primary: Indigo Blue (217 91% 60%)
- Accent: Deep Slate (222 47% 11%)
- Surface: #f9fafb (210 20% 98%)
- Font: Inter (Google Fonts)
- Tabular nums enabled for tables
- Elevated surfaces use box-shadow, no borders
- Radius: 8px outer, 4px inner

## Architecture
- App name: Apex SMS
- Multi-tenant with institute_id discriminator
- Roles: super_admin, admin, teacher, student, parent
- Super Admin controls page access per admin (on/off toggles)
- Super Admin manages message credits (top-up), admin is view-only
- Admin-defined custom batches (no pre-declared)
- Frontend-only with mock data currently

## Modules
- Student management with GRN, search/filter/pagination
- GRN Management page
- Batch Management (admin-defined custom batches)
- Attendance marking with P/A/L toggle + late time
- Fee invoicing with PDF receipt generation, send reminders, individual entries
- Study material upload (admin/teacher) + download (student)
- Document storage with preview
- Marks entry: teacher submits → admin approves → report card PDF
- Message wallet: admin view-only, super admin top-ups
- CSV/Excel/API import wizard
- Analytics with Recharts

## Removals
- Admin cannot top-up message credits (super admin only)
- No pre-declared batches (admin creates custom)
