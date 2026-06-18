-- Add term_period_id to shift_surveys so intensive surveys are linked to a specific term period
ALTER TABLE shift_surveys
  ADD COLUMN IF NOT EXISTS term_period_id UUID REFERENCES term_periods(id) ON DELETE SET NULL;
