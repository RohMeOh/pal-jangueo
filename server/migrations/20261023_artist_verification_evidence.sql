-- Pa'l Jangueo - Artist verification evidence
-- Reuses public.artists as the canonical artist registry.
-- Does not approve artists or publish events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.artist_verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  artist_id UUID NOT NULL
    REFERENCES public.artists(id)
    ON DELETE CASCADE,

  source_url TEXT NOT NULL
    CHECK (source_url ~ '^https://'),

  source_kind TEXT NOT NULL
    CHECK (source_kind IN (
      'artist_official',
      'venue_official',
      'promoter_official',
      'press',
      'other'
    )),

  claim_type TEXT NOT NULL
    CHECK (claim_type IN (
      'based_in_puerto_rico',
      'active_in_local_scene',
      'single_pr_performance'
    )),

  evidence_excerpt TEXT NOT NULL
    CHECK (
      char_length(trim(evidence_excerpt))
      BETWEEN 8 AND 1500
    ),

  verification_status TEXT NOT NULL
    DEFAULT 'pending'
    CHECK (verification_status IN (
      'pending',
      'corroborated',
      'rejected'
    )),

  checked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  UNIQUE (artist_id, source_url, claim_type)
);

CREATE INDEX IF NOT EXISTS
  artist_verification_evidence_artist_idx
ON public.artist_verification_evidence (artist_id);

-- Evidence is private to the backend unless we
-- deliberately create access policies later.
ALTER TABLE public.artist_verification_evidence
ENABLE ROW LEVEL SECURITY;

COMMIT;
