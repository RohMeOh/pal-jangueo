BEGIN;

-- Identify specific versions of source publications.
ALTER TABLE public.event_candidates
    ADD COLUMN IF NOT EXISTS source_content_hash TEXT;

-- Prevent identical source versions for the same event.
CREATE UNIQUE INDEX IF NOT EXISTS
    ux_candidate_same_source_content
ON public.event_candidates (
    is_test,
    source_url,
    candidate_fingerprint,
    source_content_hash
)
WHERE source_url IS NOT NULL
  AND candidate_fingerprint IS NOT NULL
  AND source_content_hash IS NOT NULL;

COMMIT;
