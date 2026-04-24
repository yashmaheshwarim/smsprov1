#!/usr/bin/env node
/**
 * DEBUGGING GUIDE: 400 Bad Request on Supabase Insert
 * 
 * A 400 error from Supabase REST API usually means:
 * 1. Column name mismatch (most common)
 * 2. Data type mismatch (string vs number vs boolean)
 * 3. Missing required columns
 * 4. Row Level Security (RLS) policy violation
 * 5. Foreign key constraint failure
 */

// ==========================================
// STEP 1: Check Database Schema in Supabase Dashboard
// ==========================================
/*
Go to Supabase Dashboard > Table Editor > student_fees table
Verify these columns EXACTLY match your insert:

Required columns from your SQL:
- id (uuid, default: uuid_generate_v4()) - AUTO-GENERATED, don't insert
- institute_id (uuid, NOT NULL) ✓
- student_id (uuid, NOT NULL) ✓
- batch_fee_id (uuid, nullable) ✓
- original_fee (numeric(10,2), default: 0) ✓
- final_fee (numeric(10,2), default: 0) ✓
- paid_fees (numeric(10,2), default: 0) ✓
- discount_amount (numeric(10,2), default: 0) ✓
- discount_reason (text, nullable) - optional
- discounted_fees (numeric(10,2), nullable) - optional
- status (text, default: 'pending') ✓
- last_payment_date (timestamp, nullable) - optional
- created_at (timestamp, default: now()) - AUTO-GENERATED
- updated_at (timestamp, default: now()) - AUTO-GENERATED

CHECK:
1. Are column names EXACTLY: original_fee (not original_fee)
2. Are data types correct? (numeric not integer)
3. Is RLS enabled? (disable temporarily to test)
*/

// ==========================================
// STEP 2: Capture Detailed Error from Supabase
// ==========================================
/*
Update your insert code to capture the FULL error object:
*/

async function debugInsert() {
  try {
    const { data, error, status, statusText } = await supabase
      .from("student_fees")
      .insert([{
        institute_id: "test-uuid-here",
        student_id: "test-uuid-here",
        batch_fee_id: null,
        original_fee: 1000.00,
        final_fee: 1000.00,
        paid_fees: 0,
        discount_amount: 0,
        status: "pending",
        // NOTE: Don't include 'id', 'created_at', 'updated_at' - let DB generate them
      }])
      .select(); // Add .select() to get back the inserted data or detailed error

    console.log("Status:", status);
    console.log("Status Text:", statusText);
    console.log("Data:", data);
    
    if (error) {
      console.error("FULL ERROR OBJECT:", error);
      console.error("Error message:", error.message);
      console.error("Error details:", error.details);
      console.error("Error hint:", error.hint);
      console.error("Error code:", error.code);
    }
  } catch (err) {
    console.error("Caught exception:", err);
  }
}

// ==========================================
// STEP 3: Common Fixes
// ==========================================

/*
FIX 1: Remove auto-generated columns
❌ DON'T include: id, created_at, updated_at
✓ DO include: only columns you defined in INSERT

FIX 2: Check data types
❌ original_fee: "1000" (string)
✓ original_fee: 1000.00 (number)

FIX 3: Check UUID format
❌ institute_id: "123" (not a uuid)
✓ institute_id: "550e8400-e29b-41d4-a716-446655440000" (valid uuid)

FIX 4: Disable RLS temporarily for testing
Go to Supabase Dashboard > Authentication > Policies
Find student_fees table
Toggle OFF "Enable Row Level Security" temporarily
Test your insert
If it works, your RLS policy is the issue

FIX 5: Check Foreign Key constraints
- institute_id must exist in institutes table
- student_id must exist in students table  
- batch_fee_id must exist in batch_fees table (or be null)
*/

// ==========================================
// STEP 4: Minimal Test Insert
// ==========================================

/*
Test with MINIMAL required fields first:
*/

async function minimalTest() {
  const testRecord = {
    institute_id: "YOUR_VALID_INSTITUTE_UUID",
    student_id: "YOUR_VALID_STUDENT_UUID",
    original_fee: 1000.00,
    final_fee: 1000.00,
    paid_fees: 0,
    discount_amount: 0,
    status: "pending",
  };

  console.log("Testing with:", testRecord);

  const { data, error } = await supabase
    .from("student_fees")
    .insert([testRecord])
    .select();

  if (error) {
    console.error("Minimal test failed:", error.message);
    console.error("Full error:", error);
  } else {
    console.log("Success! Inserted:", data);
  }
}

// ==========================================
// STEP 5: Verify in Supabase SQL Editor
// ==========================================

/*
Run this SQL in Supabase SQL Editor to verify table structure:
*/

const verifySQL = `
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
`;

console.log("Run this SQL in Supabase to check column names:");
console.log(verifySQL);

/*
Also check RLS status:
*/

const checkRLS = `
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'student_fees' 
  AND schemaname = 'public';
`;

console.log("\nRun this SQL to check if RLS is enabled:");
console.log(checkRLS);

// ==========================================
// QUICK FIX FOR YOUR CODE
// ==========================================

/*
In your FeesManagementPage.tsx, update the insert to:
*/

const fixForYourCode = `
const studentFeeRecords = batchStudents.map(student => ({
  institute_id: instId,                    // Must be valid UUID
  batch_fee_id: batchFeeData.id,             // Must be valid UUID or null
  student_id: student.id,                     // Must be valid UUID
  original_fee: parseFloat(batchFeeForm.totalFees),  // Must be number
  final_fee: parseFloat(batchFeeForm.totalFees),    // Must be number
  paid_fees: 0,                               // Must be number
  discount_amount: 0,                          // Must be number
  status: "pending",                           // Must match CHECK constraint
  // Remove: created_at, updated_at (DB auto-generates)
}));

const { data, error } = await supabase
  .from("student_fees")
  .insert(studentFeeRecords)
  .select();  // <-- ADD THIS to get detailed error

if (error) {
  console.error("Insert failed:", error.message);
  console.error("Details:", error.details);
  console.error("Hint:", error.hint);
  throw error;
}
`;

console.log("\nQUICK FIX - Update your insert code to:");
console.log(fixForYourCode);
