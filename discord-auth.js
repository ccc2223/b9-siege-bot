// discord-auth.js - Discord OAuth2 Authentication Routes
require('dotenv').config();
const fetch = require('node-fetch');
const crypto = require('crypto');

// Rate limiting for Discord routes
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10; // 10 attempts per window

// Configuration from environment variables
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

// In-memory state storage (use Redis in production for multiple servers)
const authStates = new Map();

/**
 * Generate secure state parameter for OAuth2
 */
function generateState(userId) {
    const state = crypto.randomBytes(16).toString('hex');
    authStates.set(state, { userId, createdAt: Date.now() });
    
    // Clean up old states (older than 10 minutes)
    setTimeout(() => {
        authStates.delete(state);
    }, 10 * 60 * 1000);
    
    return state;
}

/**
 * Rate limiting middleware for Discord routes
 */
function discordRateLimit(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries
    for (const [ip, data] of rateLimitMap.entries()) {
        if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
            rateLimitMap.delete(ip);
        }
    }
    
    const attempts = rateLimitMap.get(clientIP) || { count: 0, firstAttempt: now };
    
    if (attempts.count >= RATE_LIMIT_MAX) {
        const timeRemaining = RATE_LIMIT_WINDOW - (now - attempts.firstAttempt);
        const minutesRemaining = Math.ceil(timeRemaining / 60000);
        
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many Discord authentication attempts. Try again in ${minutesRemaining} minute(s).`,
            retryAfter: timeRemaining
        });
    }
    
    // Update rate limit counter
    rateLimitMap.set(clientIP, {
        count: attempts.count + 1,
        firstAttempt: attempts.firstAttempt
    });
    
    next();
}

/**
 * Setup Discord authentication routes for the existing Express app
 */
function setupDiscordAuth(app, db, discordDb) {
    
    // Route: Initiate Discord OAuth2 flow
    app.get('/auth/discord', discordRateLimit, (req, res) => {
        try {
            // Check if user is logged in to the web app
            if (!req.session.userId) {
                return res.redirect('/?error=login_required&message=Please log in to your account first');
            }
            
            const userId = req.session.userId;
            
            // Check if user already has Discord linked
            discordDb.getDiscordLinkStatus(userId, (err, status) => {
                if (err) {
                    console.error('Error checking Discord link status:', err);
                    return res.redirect('/?error=check_failed');
                }
                
                if (status && status.isLinked) {
                    return res.redirect(`/?error=already_linked&discord=${encodeURIComponent(status.discordUsername)}`);
                }
                
                const state = generateState(userId);
                const scopes = ['identify'].join(' ');
                
                const authURL = `https://discord.com/api/oauth2/authorize?` +
                    `client_id=${DISCORD_CLIENT_ID}&` +
                    `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&` +
                    `response_type=code&` +
                    `scope=${encodeURIComponent(scopes)}&` +
                    `state=${state}&` +
                    `prompt=consent`;
                
                console.log(`Discord OAuth2 initiated for user ${userId}`);
                res.redirect(authURL);
            });
            
        } catch (error) {
            console.error('Discord OAuth2 initiation error:', error);
            res.redirect('/?error=auth_failed');
        }
    });

    // Route: Handle Discord OAuth2 callback
    app.get('/auth/discord/callback', discordRateLimit, async (req, res) => {
        const { code, state, error: oauthError } = req.query;
        
        try {
            // Handle OAuth2 errors
            if (oauthError) {
                console.log(`Discord OAuth2 error: ${oauthError}`);
                return res.redirect('/?error=oauth_denied');
            }
            
            // Validate state parameter
            if (!state || !authStates.has(state)) {
                console.log('Invalid or expired state parameter');
                return res.redirect('/?error=invalid_state');
            }
            
            const { userId } = authStates.get(state);
            authStates.delete(state); // One-time use
            
            if (!code) {
                return res.redirect('/?error=no_code');
            }
            
            // Exchange authorization code for access token
            console.log(`Exchanging code for tokens for user ${userId}`);
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: DISCORD_REDIRECT_URI
                })
            });
            
            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                console.error('Token exchange failed:', errorText);
                return res.redirect('/?error=token_exchange_failed');
            }
            
            const tokens = await tokenResponse.json();
            
            // Get Discord user information
            console.log('Fetching Discord user info');
            const userResponse = await fetch('https://discord.com/api/users/@me', {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });
            
            if (!userResponse.ok) {
                console.error('Failed to fetch Discord user info');
                return res.redirect('/?error=user_fetch_failed');
            }
            
            const discordUser = await userResponse.json();
            
            // Check if Discord account is already linked to another user
            discordDb.getUserByDiscordId(discordUser.id, (err, existingUser) => {
                if (err) {
                    console.error('Error checking existing Discord user:', err);
                    return res.redirect('/?error=database_error');
                }
                
                if (existingUser && existingUser.id !== userId) {
                    console.log(`Discord account ${discordUser.id} already linked to user ${existingUser.id}`);
                    return res.redirect('/?error=discord_already_linked');
                }
                
                // Link the Discord account
                discordDb.linkDiscordAccount(userId, discordUser, (err) => {
                    if (err) {
                        console.error('Error linking Discord account:', err);
                        return res.redirect('/?error=link_failed');
                    }
                    
                    // Store tokens (optional)
                    if (tokens.refresh_token) {
                        discordDb.storeDiscordTokens(userId, tokens, (err) => {
                            if (err) {
                                console.error('Error storing Discord tokens:', err);
                                // Don't fail the whole process for token storage
                            }
                        });
                    }
                    
                    console.log(`Successfully linked Discord account ${discordUser.id} to user ${userId}`);
                    res.redirect(`/?success=discord_linked&discord=${encodeURIComponent(discordUser.username)}`);
                });
            });
            
        } catch (error) {
            console.error('Discord OAuth2 callback error:', error);
            res.redirect('/?error=link_failed');
        }
    });

    // Route: Unlink Discord account
    app.post('/auth/discord/unlink', discordRateLimit, (req, res) => {
        try {
            if (!req.session.userId) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    message: 'Please log in to your account first'
                });
            }
            
            const userId = req.session.userId;
            
            discordDb.unlinkDiscordAccount(userId, (err) => {
                if (err) {
                    console.error('Discord unlink error:', err);
                    return res.status(500).json({ 
                        error: 'Failed to unlink Discord account',
                        message: 'Please try again later'
                    });
                }
                
                // Also remove stored tokens
                db.db.run('DELETE FROM discord_auth_tokens WHERE user_id = ?', [userId], (err) => {
                    if (err) {
                        console.error('Error removing Discord tokens:', err);
                    }
                });
                
                console.log(`Discord account unlinked for user ${userId}`);
                res.json({ 
                    success: true, 
                    message: 'Discord account successfully unlinked' 
                });
            });
            
        } catch (error) {
            console.error('Discord unlink error:', error);
            res.status(500).json({ 
                error: 'Failed to unlink Discord account',
                message: 'Please try again later'
            });
        }
    });

    // Route: Get Discord link status
    app.get('/auth/discord/status', (req, res) => {
        try {
            if (!req.session.userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            
            const userId = req.session.userId;
            
            discordDb.getDiscordLinkStatus(userId, (err, status) => {
                if (err) {
                    console.error('Discord status check error:', err);
                    return res.status(500).json({ 
                        error: 'Failed to check Discord link status' 
                    });
                }
                
                res.json(status);
            });
            
        } catch (error) {
            console.error('Discord status check error:', error);
            res.status(500).json({ 
                error: 'Failed to check Discord link status' 
            });
        }
    });

    // API route for Discord bot to get user by Discord ID
    app.get('/api/discord/user/:discordId', (req, res) => {
        const discordUserId = req.params.discordId;
        
        discordDb.getUserByDiscordId(discordUserId, (err, user) => {
            if (err) {
                console.error('Error fetching user by Discord ID:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            
            if (user) {
                // Return safe user info (no password hash)
                res.json({
                    id: user.id,
                    username: user.username,
                    userLevel: user.user_level,
                    discordUsername: user.discord_username,
                    discordLinkedAt: user.discord_linked_at
                });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        });
    });

    // API route for Discord bot to log command usage
    app.post('/api/discord/log-command', (req, res) => {
        const {
            discordUserId,
            commandName,
            commandOptions,
            success,
            errorMessage,
            responseTime,
            guildId,
            channelId
        } = req.body;
        
        // Get user ID from Discord user ID if available
        discordDb.getUserByDiscordId(discordUserId, (err, user) => {
            const userId = user ? user.id : null;
            
            // Log the command usage
            discordDb.logDiscordCommand(
                discordUserId,
                userId,
                commandName,
                commandOptions,
                success,
                errorMessage,
                responseTime,
                (err) => {
                    if (err) {
                        console.error('Error logging Discord command:', err);
                        return res.status(500).json({ error: 'Failed to log command' });
                    }
                    
                    res.json({ success: true });
                }
            );
        });
    });

    console.log('✅ Discord authentication and API routes setup complete');
    console.log('   • /auth/discord - Initiate Discord OAuth2');
    console.log('   • /auth/discord/callback - OAuth2 callback');
    console.log('   • /auth/discord/unlink - Unlink Discord account');
    console.log('   • /auth/discord/status - Check link status');
    console.log('   • /api/discord/user/:discordId - Get user by Discord ID');
    console.log('   • /api/discord/log-command - Log bot command usage');
}

/**
 * Utility function to get user by Discord ID (for bot usage)
 */
function getUserByDiscordId(discordUserId, discordDb) {
    return new Promise((resolve, reject) => {
        discordDb.getUserByDiscordId(discordUserId, (err, user) => {
            if (err) {
                reject(err);
            } else {
                resolve(user);
            }
        });
    });
}

module.exports = {
    setupDiscordAuth,
    getUserByDiscordId
};
