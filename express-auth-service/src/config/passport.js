const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');
const { encrypt } = require('../utils/encryption');

// Dummy values for local dev to avoid crashing if env is missing
const clientID = process.env.GITHUB_CLIENT_ID || 'dummy_client_id';
const clientSecret = process.env.GITHUB_CLIENT_SECRET || 'dummy_client_secret';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
const callbackURL = `${backendUrl}/auth/github/callback`;

passport.use(new GitHubStrategy({
    clientID,
    clientSecret,
    callbackURL
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
        // Find or create user
        let user = await User.findOne({ githubId: profile.id });
        
        // Encrypt the GitHub OAuth access token before saving it to the DB
        const encryptedToken = encrypt(accessToken);

        if (user) {
            // Update token in case it changed/refreshed
            user.githubAccessToken = encryptedToken;
            user.username = profile.username;
            user.displayName = profile.displayName;
            user.avatarUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '';
            await user.save();
        } else {
            user = await User.create({
                githubId: profile.id,
                username: profile.username,
                displayName: profile.displayName,
                avatarUrl: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '',
                githubAccessToken: encryptedToken
            });
        }
        
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
  }
));

// Required by passport, even if we are stateless and using JWTs
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    done(null, { id });
});
