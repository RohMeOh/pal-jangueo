BEGIN;

-- Store event fingerprints for duplicate detection.
ALTER TABLE public.event_candidates
    ADD COLUMN IF NOT EXISTS candidate_fingerprint TEXT;

-- Speed up searches for matching fingerprints.
CREATE INDEX IF NOT EXISTS idx_candidate_fingerprint
    ON public.event_candidates(candidate_fingerprint)
    WHERE candidate_fingerprint IS NOT NULL;

COMMIT;
