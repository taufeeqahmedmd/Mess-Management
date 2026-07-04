-- Set the duplicate-tap window to a uniform 5 seconds for every active
-- category. Previously the window was inconsistent across categories (10s for
-- Students, 0 for the rest). 0-second windows meant no protection against an
-- accidental rapid double-tap; 5s gives a consistent minimum gap between taps.
-- Only active settings are used by the tap engine (one active row per category).
UPDATE "category_settings" SET "duplicate_window" = 5 WHERE "status" = 'active';
