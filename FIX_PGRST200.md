# FIX: PGRST200 - Relationship Not Found Error

## ERROR
**Code:** PGRST200  
**Message:** "Could not find a relationship between 'student_fees' and 'students' in the schema cache."

## ROOT CAUSE
Supabase PostgREST **schema cache is outdated**. The foreign key constraint exists in the database, but PostgREST doesn't recognize the relationship.

---

## SOLUTION (Step-by-Step)

### **STEP 1: Refresh Schema Cache (EASIEST - Do this first!)**

1. Go to **Supabase Dashboard**
2. Navigate to **Database** → **Tables** → `student_fees`
3. Click the **"..." menu** (top right or next to table name)
4. Select **"Refresh schema cache"**
5. Wait for confirmation
6. Test your query again

**This fixes 90% of PGRST200 errors!**

---

### **STEP 2: If Step 1 didn't work, recreate the foreign key**

Run this SQL in **Supabase SQL Editor**:

```sql
-- Drop existing foreign key if it exists
ALTER TABLE public.student_fees
DROP CONSTRAINT IF EXISTS student_fees_student_id_fkey;

-- Recreate the foreign key with explicit name
ALTER TABLE public.student_fees
ADD CONSTRAINT student_fees_student_id_fkey
FOREIGN KEY (student_id)
REFERENCES public.students(id)
ON DELETE CASCADE;

-- Also fix batch_fee_id relationship
ALTER TABLE public.student_fees
DROP CONSTRAINT IF EXISTS student_fees_batch_fee_id_fkey;

ALTER TABLE public.student_fees
ADD CONSTRAINT student_fees_batch_fee_id_fkey
FOREIGN KEY (batch_fee_id)
REFERENCES public.batch_fees(id)
ON DELETE SET NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
```

After running, **go back to Step 1 and refresh schema cache again**.

---

### **STEP 3: Verify the fix worked**

Run this in SQL Editor:

```sql
-- Check foreign keys exist
SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'student_fees'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public';
```

Expected output:
- `student_fees_student_id_fkey` → references `students(id)`
- `student_fees_batch_fee_id_fkey` → references `batch_fees(id)`

---

## CODE FIX (Updated in FeesManagementPage.tsx)

I've already updated your code to **avoid using nested select syntax** that triggers PGRST200.

**OLD CODE (causes PGRST200):**
```javascript
const { data, error } = await supabase
  .from("student_fees")
  .select(`
    *,
    students (name, enrollment_no)  // <-- This causes PGRST200
  `)
```

**NEW CODE (fixed):**
```javascript
// Fetch student fees without nested select
const { data, error } = await supabase
  .from("student_fees")
  .select("*")
  .eq("institute_id", instId);

// Fetch students separately
const studentIds = [...new Set(data.map(f => f.student_id))];
const { data: studentsData } = await supabase
  .from("students")
  .select("id, name, enrollment_no")
  .in("id", studentIds);

// Create lookup map
const studentsMap = {};
studentsData.forEach(s => {
  studentsMap[s.id] = s;
});

// Combine the data
const formatted = data.map(fee => ({
  ...fee,
  student_name: studentsMap[fee.student_id]?.name || "Unknown",
  enrollment_no: studentsMap[fee.student_id]?.enrollment_no || "",
}));
```

---

## QUICK TEST

After refreshing schema cache, test with this in **browser console**:

```javascript
async function testRelationship() {
  const { data, error } = await supabase
    .from("student_fees")
    .select(`
      *,
      students (name, enrollment_no)
    `)
    .limit(1);

  if (error) {
    console.error("Still failing:", error.message);
  } else {
    console.log("Success! Relationship works:", data);
  }
}

testRelationship();
```

---

## ALTERNATIVE: Use RPC (Database Function)

If schema cache keeps failing, create a database function:

```sql
CREATE OR REPLACE FUNCTION get_student_fees_with_details()
RETURNS TABLE (
  fee_id UUID,
  student_id UUID,
  student_name TEXT,
  enrollment_no TEXT,
  original_fee NUMERIC,
  final_fee NUMERIC,
  paid_fees NUMERIC,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sf.id,
    sf.student_id,
    s.name,
    s.enrollment_no,
    sf.original_fee,
    sf.final_fee,
    sf.paid_fees,
    sf.status
  FROM student_fees sf
  LEFT JOIN students s ON sf.student_id = s.id;
END;
$$ LANGUAGE plpgsql;

-- Then call it:
-- const { data, error } = await supabase.rpc('get_student_fees_with_details');
```

---

## SUMMARY

1. **First try:** Refresh schema cache in Supabase Dashboard (Database → Tables → student_fees → "..." → Refresh schema cache)
2. **If that fails:** Run the SQL in Step 2 to recreate foreign keys
3. **Code is already fixed:** I've updated FeesManagementPage.tsx to use separate queries instead of nested select
4. **Test:** Use the browser console test function above

The PGRST200 error should be resolved after refreshing the schema cache!
