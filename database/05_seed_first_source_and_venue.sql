BEGIN;

-- Register our first event source.
INSERT INTO public.sources (
    name,
    website_url
)
VALUES (
    'Boletera',
    'https://boletos.boletera.net/'
)
ON CONFLICT (name) DO NOTHING;

-- Register La Respuesta without creating duplicates.
INSERT INTO public.venues (
    name,
    region,
    municipality,
    neighborhood,
    address,
    location_verification_status,
    location_source_url
)
SELECT
    'La Respuesta',
    'La Metro',
    'San Juan',
    'Santurce',
    '1600 Avenida Manuel Fernández Juncos, San Juan, PR 00909',
    'unverified',
    'https://boletos.boletera.net/e/%C3%ACf%C3%A9-feat-mima-calma-carmona-raka-buscabulla'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER('La Respuesta')
      AND LOWER(TRIM(COALESCE(municipality, ''))) = 'san juan'
);

COMMIT;
