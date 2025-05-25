const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'boxes.db'));
    this.isReady = false;
    this.currentSchemaVersion = 3; // Updated schema version to include assets
  }

  async init() {
    return new Promise((resolve, reject) => {
      console.log('Initializing database...');
      
      // First, check if we need to perform a migration
      this.checkAndMigrateSchema((err) => {
        if (err) {
          console.error('Database migration failed:', err);
          return reject(err);
        }
        
        console.log('Database schema is up to date');
        this.isReady = true;
        resolve();
      });
    });
  }

  checkAndMigrateSchema(callback) {
    // Check if schema_version table exists
    this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'", (err, row) => {
      if (err) {
        return callback(err);
      }
      
      if (!row) {
        // No schema version table = old database or new database
        console.log('No schema version found. Checking for existing tables...');
        this.handleLegacyOrNewDatabase(callback);
      } else {
        // Schema version table exists, check current version
        this.db.get('SELECT version FROM schema_version ORDER BY id DESC LIMIT 1', (err, versionRow) => {
          if (err) {
            return callback(err);
          }
          
          const currentVersion = versionRow ? versionRow.version : 0;
          console.log(`Current database schema version: ${currentVersion}`);
          
          if (currentVersion < this.currentSchemaVersion) {
            console.log(`Migrating from version ${currentVersion} to ${this.currentSchemaVersion}`);
            this.performMigration(currentVersion, callback);
          } else {
            callback(null);
          }
        });
      }
    });
  }

  handleLegacyOrNewDatabase(callback) {
    // Check if any of our main tables exist
    this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='boxes'", (err, row) => {
      if (err) {
        return callback(err);
      }
      
      if (row) {
        // Tables exist but no schema version = legacy database
        console.log('Legacy database detected. Performing full migration...');
        this.performFullMigration(callback);
      } else {
        // No tables = fresh installation
        console.log('Fresh installation detected. Creating new database...');
        this.createFreshDatabase(callback);
      }
    });
  }

  performFullMigration(callback) {
    console.log('WARNING: Performing full database migration. All existing data will be cleared.');
    
    // Create a backup of the existing database
    const backupPath = path.join(__dirname, `boxes_backup_${Date.now()}.db`);
    const originalPath = path.join(__dirname, 'boxes.db');
    
    try {
      if (fs.existsSync(originalPath)) {
        fs.copyFileSync(originalPath, backupPath);
        console.log(`Backup created at: ${backupPath}`);
      }
    } catch (err) {
      console.warn('Could not create backup:', err.message);
    }
    
    this.db.serialize(() => {
      // Drop all existing tables
      const dropTables = [
        'DROP TABLE IF EXISTS applications',
        'DROP TABLE IF EXISTS box_holders', 
        'DROP TABLE IF EXISTS sessions',
        'DROP TABLE IF EXISTS users',
        'DROP TABLE IF EXISTS boxes',
        'DROP TABLE IF EXISTS schema_version'
      ];
      
      let dropCount = 0;
      dropTables.forEach(sql => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error('Error dropping table:', err);
            return callback(err);
          }
          dropCount++;
          if (dropCount === dropTables.length) {
            console.log('All legacy tables dropped. Creating new schema...');
            this.createFreshDatabase(callback);
          }
        });
      });
    });
  }

  performMigration(fromVersion, callback) {
    // For now, any migration from older version requires full rebuild
    // In the future, we could add incremental migrations here
    console.log('Performing migration requires full database rebuild...');
    this.performFullMigration(callback);
  }

  createFreshDatabase(callback) {
    console.log('Creating fresh database with current schema...');
    
    this.db.serialize(() => {
      // Create schema_version table first
      this.db.run(`
        CREATE TABLE schema_version (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating schema_version table:', err);
          return callback(err);
        }
        
        // Insert current schema version
        this.db.run('INSERT INTO schema_version (version) VALUES (?)', [this.currentSchemaVersion], (err) => {
          if (err) {
            console.error('Error inserting schema version:', err);
            return callback(err);
          }
          
          // Create all other tables
          this.createAllTables(callback);
        });
      });
    });
  }

  createAllTables(callback) {
    const tables = [
      {
        name: 'users',
        sql: `
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            user_level TEXT DEFAULT 'user' CHECK(user_level IN ('user', 'admin', 'owner')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'sessions',
        sql: `
          CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `
      },
      {
        name: 'boxes',
        sql: `
          CREATE TABLE boxes (
            id INTEGER PRIMARY KEY,
            condition1 TEXT DEFAULT 'Condition 1',
            condition2 TEXT DEFAULT 'Condition 2', 
            condition3 TEXT DEFAULT 'Condition 3',
            condition4 TEXT DEFAULT 'None of the above/Unsure'
          )
        `
      },
      {
        name: 'box_holders',
        sql: `
          CREATE TABLE box_holders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            box_id INTEGER,
            user_id INTEGER,
            conditions_met TEXT,
            status TEXT DEFAULT 'holding',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (box_id) REFERENCES boxes (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `
      },
      {
        name: 'applications',
        sql: `
          CREATE TABLE applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            box_id INTEGER,
            user_id INTEGER,
            conditions_met TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (box_id) REFERENCES boxes (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `
      },
      {
        name: 'assets',
        sql: `
          CREATE TABLE assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT CHECK(status IN ('repair', 'upgrade')) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `
      }
    ];
    
    let created = 0;
    tables.forEach(table => {
      this.db.run(table.sql, (err) => {
        if (err) {
          console.error(`Error creating ${table.name} table:`, err);
          return callback(err);
        }
        
        console.log(`Created ${table.name} table`);
        created++;
        
        if (created === tables.length) {
          console.log('All tables created successfully. Initializing data...');
          this.initializeBoxes((err) => {
            if (err) {
              console.error('Error initializing boxes:', err);
              return callback(err);
            }
            this.initializeAssets((err) => {
              if (err) {
                console.error('Error initializing assets:', err);
                return callback(err);
              }
              console.log('Database setup completed successfully');
              callback(null);
            });
          });
        }
      });
    });
  }
  
  initializeBoxes(callback) {
    const stmt = this.db.prepare(`
      INSERT INTO boxes (id, condition1, condition2, condition3, condition4) 
      VALUES (?, ?, ?, ?, ?)
    `);

    let completed = 0;
    const total = 18;
    let hasError = false;

    for (let i = 1; i <= 18; i++) {
      stmt.run(i, `Post ${i} Condition 1`, `Post ${i} Condition 2`, `Post ${i} Condition 3`, 'None of the above/Unsure', function(err) {
        if (err && !hasError) {
          hasError = true;
          return callback(err);
        }
        
        completed++;
        if (completed === total && !hasError) {
          stmt.finalize((err) => {
            if (err) {
              return callback(err);
            }
            console.log(`Initialized ${total} posts with default conditions`);
            callback(null);
          });
        }
      });
    }
  }

  initializeAssets(callback) {
    const assets = [
      // Category 1 - Mana Shrines
      { name: 'Mana Shrine 1', category: 'Mana Shrines' },
      { name: 'Mana Shrine 2', category: 'Mana Shrines' },
      // Category 2 - Magic Towers
      { name: 'Magic Tower 1', category: 'Magic Towers' },
      { name: 'Magic Tower 2', category: 'Magic Towers' },
      { name: 'Magic Tower 3', category: 'Magic Towers' },
      { name: 'Magic Tower 4', category: 'Magic Towers' },
      // Category 3 - Defense Towers
      { name: 'Defense Tower 1', category: 'Defense Towers' },
      { name: 'Defense Tower 2', category: 'Defense Towers' },
      { name: 'Defense Tower 3', category: 'Defense Towers' },
      { name: 'Defense Tower 4', category: 'Defense Towers' },
      { name: 'Defense Tower 5', category: 'Defense Towers' }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO assets (name, category) VALUES (?, ?)
    `);

    let completed = 0;
    const total = assets.length;
    let hasError = false;

    assets.forEach(asset => {
      stmt.run(asset.name, asset.category, function(err) {
        if (err && !hasError) {
          hasError = true;
          return callback(err);
        }
        
        completed++;
        if (completed === total && !hasError) {
          stmt.finalize((err) => {
            if (err) {
              return callback(err);
            }
            console.log(`Initialized ${total} assets across 3 categories`);
            callback(null);
          });
        }
      });
    });
  }

  // Get all boxes with their current holders and pending applications
  getAllBoxes(callback) {
    console.log('getAllBoxes called');
    
    // First get all boxes
    this.db.all('SELECT * FROM boxes ORDER BY id', (err, boxes) => {
      if (err) {
        console.error('Error getting boxes:', err);
        return callback(err);
      }
      
      console.log(`Found ${boxes.length} boxes in database`);
      
      if (boxes.length === 0) {
        return callback(null, []);
      }
      
      // For each box, we'll enrich it with holder and application data
      const enrichedBoxes = [];
      let processedCount = 0;
      
      boxes.forEach((box, index) => {
        // Initialize the enriched box
        const enrichedBox = {
          ...box,
          current_holder: null,
          holder_conditions: null,
          pending_applications: null
        };
        
        // Get current holder for this box
        const holderQuery = `
          SELECT u.username, bh.conditions_met
          FROM box_holders bh
          INNER JOIN users u ON bh.user_id = u.id
          WHERE bh.box_id = ? AND bh.status = 'holding'
          LIMIT 1
        `;
        
        this.db.get(holderQuery, [box.id], (err, holder) => {
          if (err) {
            console.error(`Error getting holder for box ${box.id}:`, err);
            return callback(err);
          }
          
          if (holder) {
            enrichedBox.current_holder = holder.username;
            enrichedBox.holder_conditions = holder.conditions_met;
          }
          
          // Get pending applications for this box
          const appQuery = `
            SELECT GROUP_CONCAT(u.username) as usernames
            FROM applications a
            INNER JOIN users u ON a.user_id = u.id
            WHERE a.box_id = ? AND a.status = 'pending'
          `;
          
          this.db.get(appQuery, [box.id], (err, apps) => {
            if (err) {
              console.error(`Error getting applications for box ${box.id}:`, err);
              return callback(err);
            }
            
            if (apps && apps.usernames) {
              enrichedBox.pending_applications = apps.usernames;
            }
            
            enrichedBoxes[index] = enrichedBox;
            processedCount++;
            
            // When all boxes are processed, return the results
            if (processedCount === boxes.length) {
              console.log(`Successfully enriched ${enrichedBoxes.length} boxes`);
              callback(null, enrichedBoxes);
            }
          });
        });
      });
    });
  }

  // Get specific box details
  getBox(boxId, callback) {
    const query = `
      SELECT 
        b.*,
        u.username as current_holder,
        bh.conditions_met as holder_conditions,
        GROUP_CONCAT(au.username || ':' || a.conditions_met) as applications
      FROM boxes b
      LEFT JOIN box_holders bh ON b.id = bh.box_id AND bh.status = 'holding'
      LEFT JOIN users u ON bh.user_id = u.id
      LEFT JOIN applications a ON b.id = a.box_id AND a.status = 'pending'
      LEFT JOIN users au ON a.user_id = au.id
      WHERE b.id = ?
      GROUP BY b.id
    `;
    
    this.db.get(query, [boxId], callback);
  }

  // Apply for a box
  applyForBox(boxId, userId, conditionsMet, callback) {
    const stmt = this.db.prepare(`
      INSERT INTO applications (box_id, user_id, conditions_met, status) 
      VALUES (?, ?, ?, 'pending')
    `);
    stmt.run(boxId, userId, JSON.stringify(conditionsMet), function(err) {
      callback(err, this?.lastID);
    });
    stmt.finalize();
  }

  // Hold a box (when application is accepted or direct hold)
  holdBox(boxId, userId, conditionsMet, callback) {
    this.db.serialize(() => {
      // Remove any existing holder
      this.db.run(`DELETE FROM box_holders WHERE box_id = ?`, [boxId]);
      
      // Add new holder
      const stmt = this.db.prepare(`
        INSERT INTO box_holders (box_id, user_id, conditions_met, status) 
        VALUES (?, ?, ?, 'holding')
      `);
      stmt.run(boxId, userId, JSON.stringify(conditionsMet), callback);
      stmt.finalize();
    });
  }

  // Leave a box
  leaveBox(boxId, userId, callback) {
    const stmt = this.db.prepare(`
      DELETE FROM box_holders WHERE box_id = ? AND user_id = ? AND status = 'holding'
    `);
    stmt.run(boxId, userId, callback);
    stmt.finalize();
  }

  // Withdraw application
  withdrawApplication(boxId, userId, callback) {
    const stmt = this.db.prepare(`
      DELETE FROM applications WHERE box_id = ? AND user_id = ? AND status = 'pending'
    `);
    stmt.run(boxId, userId, callback);
    stmt.finalize();
  }

  // Get all pending applications (for admin)
  getPendingApplications(callback) {
    const query = `
      SELECT a.*, u.username, b.condition1, b.condition2, b.condition3, b.condition4
      FROM applications a
      JOIN users u ON a.user_id = u.id
      JOIN boxes b ON a.box_id = b.id
      WHERE a.status = 'pending'
      ORDER BY a.created_at
    `;
    this.db.all(query, callback);
  }

  // Accept application
  acceptApplication(applicationId, callback) {
    this.db.serialize(() => {
      // First get the application details
      this.db.get(
        'SELECT * FROM applications WHERE id = ? AND status = "pending"',
        [applicationId],
        (err, app) => {
          if (err || !app) return callback(err || new Error('Application not found'));

          // Remove current holder if exists
          this.db.run('DELETE FROM box_holders WHERE box_id = ?', [app.box_id]);

          // Add new holder
          this.db.run(
            'INSERT INTO box_holders (box_id, user_id, conditions_met, status) VALUES (?, ?, ?, "holding")',
            [app.box_id, app.user_id, app.conditions_met]
          );

          // Remove the application
          this.db.run('DELETE FROM applications WHERE id = ?', [applicationId], callback);
        }
      );
    });
  }

  // Reject application
  rejectApplication(applicationId, callback) {
    const stmt = this.db.prepare(`DELETE FROM applications WHERE id = ?`);
    stmt.run(applicationId, callback);
    stmt.finalize();
  }

  // Update box conditions (admin)
  updateBoxConditions(boxId, conditions, callback) {
    const stmt = this.db.prepare(`
      UPDATE boxes 
      SET condition1 = ?, condition2 = ?, condition3 = ?, condition4 = ?
      WHERE id = ?
    `);
    stmt.run(conditions.condition1, conditions.condition2, conditions.condition3, conditions.condition4, boxId, callback);
    stmt.finalize();
  }

  // === USER AUTHENTICATION METHODS ===

  // Create a new user
  async createUser(username, password, userLevel = 'user') {
    return new Promise((resolve, reject) => {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) return reject(err);
        
        const stmt = this.db.prepare(`
          INSERT INTO users (username, password_hash, user_level) 
          VALUES (?, ?, ?)
        `);
        
        stmt.run(username, hash, userLevel, function(err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              return reject(new Error('Username already exists'));
            }
            return reject(err);
          }
          resolve({ id: this.lastID, username, userLevel });
        });
        
        stmt.finalize();
      });
    });
  }

  // Authenticate user
  async authenticateUser(username, password) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, user) => {
          if (err) return reject(err);
          if (!user) return resolve(null);
          
          bcrypt.compare(password, user.password_hash, (err, result) => {
            if (err) return reject(err);
            if (result) {
              resolve({ id: user.id, username: user.username, userLevel: user.user_level });
            } else {
              resolve(null);
            }
          });
        }
      );
    });
  }

  // Create session
  createSession(userId, callback) {
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 365 days
    
    const stmt = this.db.prepare(`
      INSERT INTO sessions (user_id, session_token, expires_at) 
      VALUES (?, ?, ?)
    `);
    
    stmt.run(userId, sessionToken, expiresAt.toISOString(), function(err) {
      if (err) return callback(err);
      callback(null, { sessionToken, expiresAt });
    });
    
    stmt.finalize();
  }

  // Get user by session token
  getUserBySession(sessionToken, callback) {
    const query = `
      SELECT u.id, u.username, u.user_level
      FROM users u
      JOIN sessions s ON u.id = s.user_id
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `;
    
    this.db.get(query, [sessionToken], callback);
  }

  // Delete session (logout)
  deleteSession(sessionToken, callback) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE session_token = ?');
    stmt.run(sessionToken, callback);
    stmt.finalize();
  }

  // Clean expired sessions
  cleanExpiredSessions(callback) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE expires_at <= datetime(\'now\')');
    stmt.run(callback);
    stmt.finalize();
  }

  // === ADMIN METHODS ===

  // Get all users (admin)
  getAllUsers(callback) {
    const query = `
      SELECT id, username, user_level, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    this.db.all(query, callback);
  }

  // Update user level (owner only)
  updateUserLevel(userId, newLevel, callback) {
    const stmt = this.db.prepare(`
      UPDATE users SET user_level = ? WHERE id = ?
    `);
    stmt.run(newLevel, userId, callback);
    stmt.finalize();
  }

  // Force assign user to box (admin)
  forceAssignBox(boxId, userId, conditions, callback) {
    this.holdBox(boxId, userId, conditions, callback);
  }

  // Remove user from box (admin)
  removeUserFromBox(boxId, callback) {
    const stmt = this.db.prepare('DELETE FROM box_holders WHERE box_id = ?');
    stmt.run(boxId, callback);
    stmt.finalize();
  }

  // Get user by ID
  getUserById(userId, callback) {
    const query = 'SELECT id, username, user_level FROM users WHERE id = ?';
    this.db.get(query, [userId], callback);
  }

  // === ASSET MANAGEMENT METHODS ===

  // Get all assets
  getAllAssets(callback) {
    const query = `
      SELECT id, name, category, status, created_at, updated_at
      FROM assets
      ORDER BY category, name
    `;
    this.db.all(query, callback);
  }

  // Get assets by status (repair or upgrade)
  getAssetsByStatus(status, callback) {
    const query = `
      SELECT id, name, category, status, created_at, updated_at
      FROM assets
      WHERE status = ?
      ORDER BY category, name
    `;
    this.db.all(query, [status], callback);
  }

  // Update asset status
  updateAssetStatus(assetId, status, callback) {
    const stmt = this.db.prepare(`
      UPDATE assets 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, assetId, callback);
    stmt.finalize();
  }

  // Clear asset status (set to NULL)
  clearAssetStatus(assetId, callback) {
    const stmt = this.db.prepare(`
      UPDATE assets 
      SET status = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(assetId, callback);
    stmt.finalize();
  }

  close(callback) {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database closed successfully');
      }
      if (callback) callback(err);
    });
  }
}

module.exports = Database;