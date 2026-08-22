require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const connectDB = require('./config/db');

// Initialize Passport config
require('./config/passport');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Connect to Database
connectDB();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true, // Allow cookies to be sent (refresh token)
}));
app.use(passport.initialize());

// Routes
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'express-auth' }));

app.listen(PORT, () => {
    console.log(`Express Auth Service running on port ${PORT}`);
});
