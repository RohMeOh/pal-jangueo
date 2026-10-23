-- Pa'l Jangueo: Independent music scene registry.
-- Venue location verification is separate from scene membership.
-- Artist scene evidence remains in the existing artist tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scene_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type TEXT NOT NULL
    CHECK (entity_type IN (
      'venue',
      'promoter',
      'collective'
    )),

  venue_id UUID UNIQUE
    REFERENCES public.venues(id)
    ON DELETE RESTRICT,

  name TEXT,

  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN (
      'pending',
      'verified',
      'rejected'
    )),

  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (
      entity_type = 'venue'
      AND venue_id IS NOT NULL
      AND name IS NULL
    )
    OR
    (
      entity_type IN ('promoter', 'collective')
      AND venue_id IS NULL
      AND NULLIF(BTRIM(name), '') IS NOT NULL
    )
  ),

  CHECK (
    verification_status <> 'verified'
    OR verified_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  scene_entities_organization_name_unique
ON public.scene_entities (
  entity_type,
  LOWER(BTRIM(name))
)
WHERE entity_type IN ('promoter', 'collective');

CREATE TABLE IF NOT EXISTS public.scene_entity_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  scene_entity_id UUID NOT NULL
    REFERENCES public.scene_entities(id)
    ON DELETE CASCADE,

  source_url TEXT NOT NULL
    CHECK (source_url ~ '^https://'),

  source_kind TEXT NOT NULL
    CHECK (source_kind IN (
      'official',
      'press',
      'promoter',
      'venue',
      'other'
    )),

  evidence_summary TEXT NOT NULL
    CHECK (LENGTH(BTRIM(evidence_summary)) >= 15),

  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN (
      'pending',
      'corroborated',
      'rejected'
    )),

  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (scene_entity_id, source_url)
);

CREATE INDEX IF NOT EXISTS
  scene_entity_evidence_entity_idx
ON public.scene_entity_evidence(scene_entity_id);

ALTER TABLE public.scene_entities
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scene_entity_evidence
ENABLE ROW LEVEL SECURITY;

COMMIT;
