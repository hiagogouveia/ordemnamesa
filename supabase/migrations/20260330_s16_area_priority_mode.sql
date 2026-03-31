-- Add priority_mode to areas table
-- 'auto' = system decides order based on time intelligence
-- 'manual' = manager-defined order via order_index
ALTER TABLE areas
ADD COLUMN IF NOT EXISTS priority_mode text NOT NULL DEFAULT 'auto'
CHECK (priority_mode IN ('auto', 'manual'));
