// Pa'l Jangueo - Public events API

const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.description,
        e.start_at,
        e.end_at,
        e.price_type,
        e.price_min,
        e.price_max,
        e.flyer_url,
        e.ticket_url,
        e.ticket_provider,
        v.name AS venue_name,
        v.region,
        v.municipality,
        v.neighborhood,
        v.address AS venue_address
      FROM public.events e
      JOIN public.venues v
        ON v.id = e.venue_id
      WHERE e.is_published = TRUE
        AND e.status = 'scheduled'
        AND e.start_at >= NOW()
        AND v.location_verification_status = 'verified'
      ORDER BY e.start_at ASC
      LIMIT 100
    `);

    res.json({
      count: rows.length,
      events: rows
    });

  } catch (error) {
    console.error(
      'Error loading events:',
      error.code || error.message
    );

    res.status(500).json({
      error: 'No se pudieron cargar los eventos.'
    });
  }
});

module.exports = router;
