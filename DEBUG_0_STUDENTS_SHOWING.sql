-- ==========================================
-- CHECK: Why are 0 students showing?
-- ==========================================

-- Step 1: Check if your institute exists
SELECT id, name, status 
FROM institutes 
WHERE id = 'YOUR_INSTITUTE_ID';
-- Replace YOUR_INSTITUTE_ID with your actual institute ID
-- You can get it from: SELECT id FROM institutes LIMIT 1;

-- Step 2: Check batches in your institute
SELECT id, name, class_name, status 
FROM batches 
WHERE institute_id = 'YOUR_INSTITUTE_ID'
  AND status = 'active';

-- Step 3: Check students in a specific batch
-- Replace BATCH_ID with an ID from Step 2
SELECT 
  b.name as batch_name,
  COUNT(*) as total_students,
  COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_students
FROM students s
RIGHT JOIN batches b ON b.id = s.batch_id
WHERE b.id = 'BATCH_ID'
  AND s.institute_id = 'YOUR_INSTITUTE_ID'
GROUP BY b.name;

-- Step 4: Check if batch_fees were created
SELECT 
  bf.id,
  bf.title,
  bf.total_fees,
  b.name as batch_name,
  (SELECT COUNT(*) FROM student_fees sf WHERE sf.batch_fee_id = bf.id) as student_fee_records
FROM batch_fees bf
JOIN batches b ON b.id = bf.batch_id
WHERE bf.institute_id = 'YOUR_INSTITUTE_ID'
  AND bf.status = 'active'
ORDER BY bf.created_at DESC;

-- Step 5: Check if student_fees exist
SELECT 
  COUNT(*) as total_student_fees,
  COUNT(CASE WHEN batch_fee_id IS NOT NULL THEN 1 END) as with_batch_fee_id,
  COUNT(CASE WHEN batch_fee_id IS NULL THEN 1 END) as without_batch_fee_id
FROM student_fees
WHERE institute_id = 'YOUR_INSTITUTE_ID';

-- Step 6: See actual student_fees data
SELECT 
  sf.id,
  sf.original_fee,
  sf.final_fee,
  sf.paid_fees,
  sf.batch_fee_id,
  s.name as student_name,
  s.batch_id,
  b.name as batch_name
FROM student_fees sf
JOIN students s ON s.id = sf.student_id
LEFT JOIN batch_fees bf ON bf.id = sf.batch_fee_id
LEFT JOIN batches b ON b.id = sf.batch_id
WHERE sf.institute_id = 'YOUR_INSTITUTE_ID'
  AND sf.batch_fee_id IS NOT NULL
ORDER BY sf.created_at DESC
LIMIT 10;

-- ==========================================
-- FIX: If no student_fees exist, create them manually
-- ==========================================

/*
DO $$
DECLARE
  inst_id UUID := 'YOUR_INSTITUTE_ID';
  batch_fee_id UUID;
  batch_id UUID;
BEGIN
  -- Get a batch_fee
  SELECT bf.id, bf.batch_id, bf.total_fees 
  INTO batch_fee_id, batch_id, total_fee
  FROM batch_fees bf
  WHERE bf.institute_id = inst_id
    AND bf.status = 'active'
  LIMIT 1;
  
  IF batch_fee_id IS NULL THEN
    RAISE NOTICE 'No batch fees found! Create a batch fee first.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found batch_fee: %, batch: %, total_fee: %', batch_fee_id, batch_id, total_fee;
  
  -- Insert student fees for all active students in that batch
  INSERT INTO student_fees (
    institute_id,
    student_id,
    batch_fee_id,
    original_fee,
    final_fee,
    paid_fees,
    discount_amount,
    status
  )
  SELECT 
    inst_id,
    s.id,
    batch_fee_id,
    total_fee,
    total_fee,
    0,
    0,
    'pending'
  FROM students s
  WHERE s.batch_id = batch_id
    AND s.institute_id = inst_id
    AND s.status = 'active';
  
  RAISE NOTICE 'Created % student fee records', (SELECT COUNT(*) FROM student_fees WHERE batch_fee_id = batch_fee_id);
END $$;
*/
