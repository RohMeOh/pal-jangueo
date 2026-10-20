const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173'
}));

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    application: "Pa'l Jangueo",
    service: 'backend'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Pa'l Jangueo API running on port ${PORT}`);
});
