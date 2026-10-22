BEGIN;

DO $$
DECLARE
    venue_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO venue_count
    FROM public.venues
    WHERE LOWER(TRIM(name)) = 'la respuesta'
      AND LOWER(TRIM(municipality)) = 'san juan';

    IF venue_count <> 1 THEN
        RAISE EXCEPTION
            'Se esperaba exactamente un registro de La Respuesta.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.venues
        WHERE LOWER(TRIM(name)) = 'la respuesta'
          AND LOWER(TRIM(municipality)) = 'san juan'
          AND address ILIKE '1600%juncos%'
    ) THEN
        RAISE EXCEPTION
            'La dirección registrada requiere revisión manual.';
    END IF;

    UPDATE public.venues
    SET
        location_verification_status = 'verified',
        location_verified_at = NOW(),
        location_source_url =
            'https://www.discoverpuertorico.com/profile/la-respuesta/9353'
    WHERE LOWER(TRIM(name)) = 'la respuesta'
      AND LOWER(TRIM(municipality)) = 'san juan';
END;
$$;

COMMIT;
