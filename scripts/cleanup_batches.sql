-- ==========================================
-- Batch Cleanup Script
-- Keeps: 2TH SCIENCE, 12TH COMMERCE, 10TH CONVENT, 10TH PRAGATI
-- Deletes all other batches and their associated fee structures
-- ==========================================

-- Step 1: Preview what will be deleted
-- Run this first to verify

SELECT 
  b.id as batch_id,
  b.name as batch_name,
  b.institute_id,
  i.name as institute_name,
  COUNT(bf.id) as fee_structures_count,
  COUNT(sf.id) as student_fee_records_count
FROM batches b
LEFT JOIN institutes i ON b.institute_id = i.id
LEFT JOIN batch_fees bf ON bf.batch_id = b.id
LEFT JOIN student_fees sf ON sf.batch_fee_id = bf.id
WHERE b.name NOT IN ('2TH SCIENCE', '12TH COMMERCE', '10TH CONVENT', '10TH PRAGATI')
  AND b.status = 'active'
GROUP BY b.id, b.name, b.institute_id, i.name
ORDER BY i.name, b.name;

-- Step 2: If preview looks correct, run this to delete
-- WARNING: This will permanently delete data

-- Delete student_fees and batch_fees for batches to be removed
-- (ON DELETE CASCADE will handle this, but explicit for clarity)

DELETE FROM student_fees
WHERE batch_fee_id IN (
  SELECT bf.id FROM batch_fees bf
  JOIN batches b ON bf.batch_id = b.id
  WHERE b.name NOT IN ('2TH SCIENCE', '12TH COMMERCE', '10TH CONVENT', '10TH PRAGATI')
    AND b.status = 'active'
);

DELETE FROM batch_fees
WHERE batch_id IN (
  SELECT id FROM batches
  WHERE name NOT IN ('2TH SCIENCE', '12TH COMMERCE', '10TH CONVENT', '10TH PRAGATI')
    AND status = 'active'
);

-- Delete the batches themselves
DELETE FROM batches
WHERE name NOT IN ('2TH SCIENCE', '12TH COMMERCE', '10TH CONVENT', '10TH PRAGATI')
  AND status = 'active';

-- Step 3: Verify remaining batches
SELECT 
  b.id,
  b.name,
  b.status,
  i.name as institute_name,
  COUNT(bf.id) as fee_structures,
  COUNT(sf.id) as student_records
FROM batches b
LEFT JOIN institutes i ON b.institute_id = i.id
LEFT JOIN batch_fees bf ON bf.batch_id = b.id
LEFT JOIN student_fees sf ON sf.batch_fee_id = bf.id
WHERE b.status = 'active'
GROUP BY b.id, b.name, b.institute_id, i.name
ORDER BY i.name, b.name;
