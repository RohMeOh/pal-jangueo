require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');
const eventsRouter = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Allowed frontend origins for development and production
const allowedOrigins = (
  process.env.CLIENT_ORIGINS || 'http://localhost:5173'
)
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  }
}));

app.use(express.json());

app.use('/api/events', eventsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    application: "Pa'l Jangueo",
    service: 'backend'
  });
});

// Database connection test
app.get('/api/db-health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM public.events'
    );

    res.json({
      status: 'ok',
      database: 'connected',
      events: Number(result.rows[0].count)
    });

  } catch (error) {
    console.error('Database error:', error.code || error.message);

    res.status(500).json({
      status: 'error',
      database: 'disconnected'
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Pa'l Jangueo API running on port ${PORT}`);
});
