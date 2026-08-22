const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. Initiate GitHub Login
router.get('/github',
  passport.authenticate('github', { scope: ['repo', 'user'] })
);

// 2. GitHub Callback URL
router.get('/github/callback', 
  passport.authenticate('github', { session: false, failureRedirect: '/login-failed' }),
  (req, res) => {
    // Authentication successful, generate JWT
    const user = req.user;
    
    // Access token (15 mins)
    const accessToken = jwt.sign(
        { userId: user._id },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    // Refresh token (7 days)
    const refreshToken = jwt.sign(
        { userId: user._id },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    // Set Refresh Token as an httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // True if HTTPS
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Send access token back to the frontend
    // We are redirecting the user back to the React app with the access token in a hash fragment
    res.redirect(`${FRONTEND_URL}/#access_token=${accessToken}`);
  }
);

// 3. Refresh Token Endpoint
router.post('/refresh', (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token provided' });

    jwt.verify(refreshToken, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid refresh token' });

        const newAccessToken = jwt.sign(
            { userId: decoded.userId },
            JWT_SECRET,
            { expiresIn: '15m' }
        );
        res.json({ accessToken: newAccessToken });
    });
});

// 4. Logout
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.json({ message: 'Logged out successfully' });
});

module.exports = router;
