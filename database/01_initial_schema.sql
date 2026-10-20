BEGIN;

-- 1. Locales donde ocurren los eventos
CREATE TABLE public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    region TEXT CHECK (region IN (
        'La Metro', 'Norte', 'Sur',
        'Este', 'El West', 'El Centro'
    )),
    municipality TEXT,
    neighborhood TEXT,
    address TEXT,
    website_url TEXT,
    instagram_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Artistas y bandas musicales
CREATE TABLE public.artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    genre TEXT,
    website_url TEXT,
    instagram_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fuentes de información
CREATE TABLE public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    website_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Eventos musicales
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    venue_id UUID NOT NULL REFERENCES public.venues(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN (
            'scheduled', 'postponed',
            'cancelled', 'rescheduled'
        )),
    price_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (price_type IN ('free', 'paid', 'unknown')),
    price_min NUMERIC(10,2) CHECK (price_min >= 0),
    price_max NUMERIC(10,2) CHECK (price_max >= 0),
    flyer_url TEXT,
    ticket_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_at IS NULL OR end_at >= start_at),
    CHECK (
        price_min IS NULL OR price_max IS NULL
        OR price_max >= price_min
    )
);

-- 5. Artistas que participan en cada evento
CREATE TABLE public.event_artists (
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    artist_id UUID REFERENCES public.artists(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, artist_id)
);

-- 6. Fuentes utilizadas para verificar cada evento
CREATE TABLE public.event_sources (
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    last_checked_at TIMESTAMPTZ,
    PRIMARY KEY (event_id, source_id)
);

-- Índices para mejorar las búsquedas
CREATE INDEX idx_events_start_at ON public.events(start_at);
CREATE INDEX idx_events_venue ON public.events(venue_id);
CREATE INDEX idx_venues_location
    ON public.venues(region, municipality, neighborhood);

-- Seguridad: proteger todas las tablas
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

COMMIT;
