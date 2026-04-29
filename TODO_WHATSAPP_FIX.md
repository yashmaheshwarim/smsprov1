# WhatsApp Parents Notification Fix - Queued for 0 Parents Bug

Current status: Messages queued for 0 parents despite absentees because using student.phone instead of parent phones.

## Breakdown Steps:
- [x] 1. Update AttendancePage.tsx fetchData(): Add `mother_phone, father_phone` to students select query
- [x] 2. Update AttendancePage.tsx Student interface: Add mother_phone?: string, father_phone?: string
- [x] 3. Update handleNotifyAbsent(): 
  |  - For each absent student, get parentPhone = mother_phone || father_phone || null
  |  - Filter only those with valid parentPhone (non-empty)
  |  - Send notification using parentPhone
  |  - Update toast to `${sentCount} parents (${absentCount} students)`

- [ ] 5. Verify Supabase message_logs table has pending entries for parent phones
- [x] 6. Update this TODO as steps complete

**Note**: Students table has mother_phone, father_phone per StudentDetailPage.tsx
