# TODO

- [ ] Update `MarksPage.tsx`:
  - [ ] During **Edit Exam / Update Exam**: fetch `exam_attendance` for each student for that exam (exam_name, subject, exam_date) and if status is `absent`, force marks to display/save as `Absent` (no marks entered).
  - [ ] Update the **View Marks** dialog to show `Absent` instead of numeric marks and remove % calculation for absent students.
  - [ ] Update **PDF and Excel report generation** to show `Absent` instead of numeric marks and keep total/percentage logic safe.
- [ ] Ensure types compile and run.
- [ ] Quick manual test flow: mark attendance as absent -> enter/edit marks -> confirm marks/report show Absent.

