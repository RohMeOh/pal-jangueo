BEGIN;

-- Verified venue information
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS location_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (location_verification_status IN ('unverified', 'verified', 'conflict')),
    ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS location_source_url TEXT,
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- Ticket seller
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS ticket_provider TEXT;

-- Events awaiting verification
CREATE TABLE IF NOT EXISTS public.event_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT,
    source_url TEXT,
    flyer_url TEXT,
    caption_text TEXT,
    analysis_result JSONB NOT NULL
        CHECK (jsonb_typeof(analysis_result) = 'object'),
    review_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (review_status IN (
            'pending_review',
            'needs_more_info',
            'approved',
            'rejected'
        )),
    is_test BOOLEAN NOT NULL DEFAULT TRUE,
    approved_event_id UUID
        REFERENCES public.events(id) ON DELETE SET NULL,
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT is_test OR review_status <> 'approved')
);

-- Indexes for faster candidate searches
CREATE INDEX IF NOT EXISTS idx_event_candidates_review
    ON public.event_candidates(review_status, created_at);

CREATE INDEX IF NOT EXISTS idx_event_candidates_source
    ON public.event_candidates(source_url);

-- Protect candidates using Row Level Security
ALTER TABLE public.event_candidates
    ENABLE ROW LEVEL SECURITY;

-- Finish migration
COMMIT;
