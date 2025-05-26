// Updated server.js with Discord integration
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('./database');
const DiscordDatabaseExtension = require('./discord-database-extension');
const { setupDiscordAuth } = require('./discord-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database();

// Initialize Discord database extension
let discordDb = null;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session middleware
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './'
  }),
  secret: process.env.SESSION_SECRET || 'bb99-siege-war-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: process.env.NODE_ENV === 'production',
  cookie: { 
    secure: false, // Set to false for Railway compatibility
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    sameSite: 'lax'
  }
}));

// Database ready check middleware for API routes
app.use('/api', (req, res, next) => {
  if (!db.isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  next();
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.session.userId || !['admin', 'owner'].includes(req.session.userLevel)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Discord Bot Authentication middleware
const requireDiscordBotAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer discord-bot-')) {
    return res.status(401).json({ error: 'Discord bot authentication required' });
  }
  
  const userId = authHeader.replace('Bearer discord-bot-', '');
  
  // Verify the user exists and has a linked Discord account
  if (!discordDb) {
    return res.status(503).json({ error: 'Discord integration not initialized' });
  }
  
  try {
    // Get user by their internal ID
    db.getUserById(parseInt(userId), (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid user authentication' });
      }
      
      // Attach user info to request
      req.user = user;
      req.userId = user.id;
      next();
    });
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Alternative Discord authentication by Discord User ID
const requireDiscordUserAuth = async (req, res, next) => {
  const { discordUserId } = req.body;
  
  if (!discordUserId) {
    return res.status(401).json({ error: 'Discord user ID required' });
  }
  
  if (!discordDb) {
    return res.status(503).json({ error: 'Discord integration not initialized' });
  }
  
  try {
    discordDb.getUserByDiscordId(discordUserId, (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Discord account not linked' });
      }
      
      // Attach user info to request
      req.user = user;
      req.userId = user.id;
      next();
    });
  } catch (error) {
    return res.status(401).json({ error: 'Discord authentication failed' });
  }
};

// Owner middleware
const requireOwner = (req, res, next) => {
  if (!req.session.userId || req.session.userLevel !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve upgrade & repair page
app.get('/upgrade-repair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upgrade-repair.html'));
});

// === AUTHENTICATION ROUTES ===

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, adminInviteCode } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    
    // Determine user level based on admin invite code
    let userLevel = 'user';
    if (adminInviteCode === '99BB99BB') {
      userLevel = 'admin';
    } else if (adminInviteCode === 'Palmolive_men99') {
      userLevel = 'owner';
    }
    
    const user = await db.createUser(username, password, userLevel);
    
    // Create session
    db.createSession(user.id, (err, session) => {
      if (err) {
        return res.status(500).json({ error: 'Error creating session' });
      }
      
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.userLevel = user.userLevel;
      
      res.json({ 
        success: true, 
        user: { id: user.id, username: user.username, userLevel: user.userLevel }
      });
    });
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = await db.authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Create session
    db.createSession(user.id, (err, session) => {
      if (err) {
        return res.status(500).json({ error: 'Error creating session' });
      }
      
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.userLevel = user.userLevel;
      
      res.json({ 
        success: true, 
        user: { id: user.id, username: user.username, userLevel: user.userLevel }
      });
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.json({ success: true });
  });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        userLevel: req.session.userLevel
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// API Routes

// Get all boxes with their status
app.get('/api/boxes', (req, res) => {
  let responseSent = false;
  
  db.getAllBoxes((err, boxes) => {
    if (responseSent) {
      console.log('Response already sent, ignoring callback');
      return;
    }
    
    if (err) {
      console.error('Error in /api/boxes endpoint:', err);
      responseSent = true;
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`API response: Loaded ${boxes ? boxes.length : 0} boxes`);
    responseSent = true;
    res.json(boxes || []);
  });
});

// Get specific box details
app.get('/api/boxes/:id', (req, res) => {
  const boxId = parseInt(req.params.id);
  db.getBox(boxId, (err, box) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!box) {
      return res.status(404).json({ error: 'Box not found' });
    }
    res.json(box);
  });
});

// Apply for a box
app.post('/api/boxes/:id/apply', requireAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const { conditions } = req.body;
  const userId = req.session.userId;

  if (!conditions || conditions.length === 0) {
    return res.status(400).json({ error: 'At least one condition must be selected' });
  }

  db.applyForBox(boxId, userId, conditions, (err, applicationId) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, applicationId });
  });
});

// Hold a box directly (for when a box is empty)
app.post('/api/boxes/:id/hold', requireAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const { conditions } = req.body;
  const userId = req.session.userId;

  if (!conditions || conditions.length === 0) {
    return res.status(400).json({ error: 'At least one condition must be selected' });
  }

  db.holdBox(boxId, userId, conditions, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Leave a box
app.post('/api/boxes/:id/leave', requireAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const userId = req.session.userId;

  db.leaveBox(boxId, userId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Withdraw application
app.post('/api/boxes/:id/withdraw', requireAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const userId = req.session.userId;

  db.withdrawApplication(boxId, userId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// === DISCORD BOT API ROUTES ===

// Discord Bot: Apply for a box
app.post('/api/discord/boxes/:id/apply', requireDiscordUserAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const { conditions } = req.body;
  const userId = req.userId;

  if (!conditions || conditions.length === 0) {
    return res.status(400).json({ error: 'At least one condition must be selected' });
  }

  db.applyForBox(boxId, userId, conditions, (err, applicationId) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, applicationId, message: 'Application submitted successfully' });
  });
});

// Discord Bot: Hold a box
app.post('/api/discord/boxes/:id/hold', requireDiscordUserAuth, (req, res) => {
  const boxId = parseInt(req.params.id);
  const { conditions } = req.body;
  const userId = req.userId;

  if (!conditions || conditions.length === 0) {
    return res.status(400).json({ error: 'At least one condition must be selected' });
  }

  db.holdBox(boxId, userId, conditions, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, message: 'Box held successfully' });
  });
});

// Admin Routes

// Get all pending applications
app.get('/api/admin/applications', requireAdmin, (req, res) => {
  db.getPendingApplications((err, applications) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(applications);
  });
});

// Accept application
app.post('/api/admin/applications/:id/accept', requireAdmin, (req, res) => {
  const applicationId = parseInt(req.params.id);
  
  db.acceptApplication(applicationId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Reject application
app.post('/api/admin/applications/:id/reject', requireAdmin, (req, res) => {
  const applicationId = parseInt(req.params.id);
  
  db.rejectApplication(applicationId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Update box conditions
app.put('/api/admin/boxes/:id/conditions', requireAdmin, (req, res) => {
  const boxId = parseInt(req.params.id);
  const conditions = req.body;

  if (!conditions.condition1 || !conditions.condition2 || !conditions.condition3 || !conditions.condition4) {
    return res.status(400).json({ error: 'All four conditions must be provided' });
  }

  db.updateBoxConditions(boxId, conditions, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Bulk import conditions from text
app.post('/api/admin/boxes/bulk-import-conditions', requireAdmin, (req, res) => {
  const { changes } = req.body;

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'Changes array is required' });
  }

  // Validate each change
  for (const change of changes) {
    if (!change.postId || !change.condition1 || !change.condition2 || !change.condition3) {
      return res.status(400).json({ error: 'Each change must have postId and 3 conditions' });
    }
    
    if (change.postId < 1 || change.postId > 18) {
      return res.status(400).json({ error: `Invalid post ID: ${change.postId}. Must be between 1 and 18` });
    }
  }

  // Process all updates in sequence
  let completed = 0;
  const results = [];
  let hasError = false;

  changes.forEach((change, index) => {
    if (hasError) return;

    const conditions = {
      condition1: change.condition1,
      condition2: change.condition2,
      condition3: change.condition3,
      condition4: 'None of the above/Unsure' // Always keep condition4 as specified
    };

    db.updateBoxConditions(change.postId, conditions, (err) => {
      if (err && !hasError) {
        hasError = true;
        return res.status(500).json({ error: `Error updating Post ${change.postId}: ${err.message}` });
      }

      if (!hasError) {
        results.push({
          postId: change.postId,
          condition1: change.condition1,
          condition2: change.condition2,
          condition3: change.condition3
        });

        completed++;
        if (completed === changes.length) {
          res.json({ 
            success: true, 
            message: `Successfully updated ${completed} post(s)`,
            changes: results 
          });
        }
      }
    });
  });
});

// Get all users (admin)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  db.getAllUsers((err, users) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(users);
  });
});

// Force assign user to box (admin)
app.post('/api/admin/boxes/:id/assign', requireAdmin, (req, res) => {
  const boxId = parseInt(req.params.id);
  const { userId, conditions } = req.body;

  if (!userId || !conditions || conditions.length === 0) {
    return res.status(400).json({ error: 'User ID and conditions are required' });
  }

  db.forceAssignBox(boxId, userId, conditions, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Remove user from box (admin)
app.post('/api/admin/boxes/:id/remove', requireAdmin, (req, res) => {
  const boxId = parseInt(req.params.id);

  db.removeUserFromBox(boxId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// === OWNER ROUTES ===

// Update user level (owner only)
app.put('/api/owner/users/:id/level', requireOwner, (req, res) => {
  const userId = parseInt(req.params.id);
  const { userLevel } = req.body;

  if (!['user', 'admin', 'owner'].includes(userLevel)) {
    return res.status(400).json({ error: 'Invalid user level' });
  }

  db.updateUserLevel(userId, userLevel, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// === ASSET ROUTES ===

// Get all assets
app.get('/api/assets', (req, res) => {
  db.getAllAssets((err, assets) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(assets);
  });
});

// Get assets by status (repair or upgrade)
app.get('/api/assets/:status', (req, res) => {
  const status = req.params.status;
  
  if (!['repair', 'upgrade'].includes(status)) {
    return res.status(400).json({ error: 'Status must be repair or upgrade' });
  }
  
  db.getAssetsByStatus(status, (err, assets) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(assets);
  });
});

// Update asset status (admin only)
app.put('/api/admin/assets/:id/status', requireAdmin, (req, res) => {
  const assetId = parseInt(req.params.id);
  const { status } = req.body;
  
  if (status && !['repair', 'upgrade'].includes(status)) {
    return res.status(400).json({ error: 'Status must be repair, upgrade, or null' });
  }
  
  if (status) {
    db.updateAssetStatus(assetId, status, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  } else {
    // Clear status
    db.clearAssetStatus(assetId, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await db.init();
    
    // Initialize Discord database extension
    discordDb = new DiscordDatabaseExtension(db);
    await discordDb.addDiscordSupport();
    
    // Setup Discord authentication routes
    setupDiscordAuth(app, db, discordDb);
    
    // Quick test to verify boxes are initialized
    setTimeout(() => {
      db.getAllBoxes((err, boxes) => {
        if (err) {
          console.error('Error testing boxes after init:', err);
        } else {
          console.log(`Database verification: Found ${boxes.length} boxes`);
          if (boxes.length > 0) {
            console.log('Sample box structure:', {
              id: boxes[0].id,
              condition1: boxes[0].condition1,
              current_holder: boxes[0].current_holder,
              pending_applications: boxes[0].pending_applications
            });
          }
        }
      });
    }, 1000); // Give database a moment to fully initialize
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('✅ BB99 Siege War is ready!');
      console.log('🤖 Discord integration enabled');
      console.log('');
      console.log('📋 Available features:');
      console.log('   • Web application: Box management, user authentication');
      console.log('   • Discord OAuth2: Link Discord accounts');
      console.log('   • Discord Bot: Manage boxes from Discord');
      console.log('');
      console.log('🔧 Next steps:');
      console.log('   1. Configure your .env file with Discord credentials');
      console.log('   2. Start the Discord bot: npm run bot');
      console.log('   3. Add the bot to your Discord server');
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.close(() => {
    process.exit(0);
  });
});
