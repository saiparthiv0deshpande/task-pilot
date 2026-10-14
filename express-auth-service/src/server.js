require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const connectDB = require('./config/db');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use('/auth', require('./routes/auth'));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'express-auth' }));
app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.name);
  res.status(500).json({ message: 'The request could not be completed' });
});

async function start() {
  await connectDB();
  app.listen(config.port, () => console.log(`Express auth service listening on configured port ${config.port}`));
}

start().catch((error) => {
  console.error('Express auth service could not start:', error.name);
  process.exitCode = 1;
});
