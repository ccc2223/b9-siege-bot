// discord-database-extension.js - Extension to add Discord support to existing database
const path = require('path');

class DiscordDatabaseExtension {
  constructor(database) {
    this.db = database;
  }

  // Check if Discord tables exist and add them if needed
  async addDiscordSupport() {
    return new Promise((resolve, reject) => {
      console.log('Adding Discord support to existing database...');
      
      // Check if discord_user_id column exists in users table
      this.db.db.get("PRAGMA table_info(users)", (err, info) => {
        if (err) {
          return reject(err);
        }
        
        // Check if users table has discord columns
        this.db.db.all("PRAGMA table_info(users)", (err, columns) => {
          if (err) {
            return reject(err);
          }
          
          const hasDiscordColumns = columns.some(col => col.name === 'discord_user_id');
          
          if (!hasDiscordColumns) {
            console.log('Adding Discord columns to users table...');
            this.addDiscordColumnsToUsers(() => {
              this.createDiscordTables(resolve, reject);
            });
          } else {
            console.log('Discord columns already exist in users table');
            this.createDiscordTables(resolve, reject);
          }
        });
      });
    });
  }

  addDiscordColumnsToUsers(callback) {
    this.db.db.serialize(() => {
      const alterQueries = [
        'ALTER TABLE users ADD COLUMN discord_user_id TEXT',
        'ALTER TABLE users ADD COLUMN discord_username TEXT',
        'ALTER TABLE users ADD COLUMN discord_avatar TEXT',
        'ALTER TABLE users ADD COLUMN discord_linked_at DATETIME'
      ];
      
      let completed = 0;
      alterQueries.forEach(query => {
        this.db.db.run(query, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding Discord column:', err);
            return callback(err);
          }
          
          completed++;
          if (completed === alterQueries.length) {
            console.log('Successfully added Discord columns to users table');
            // Now create unique index for discord_user_id
            this.db.db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_user_id_unique ON users(discord_user_id) WHERE discord_user_id IS NOT NULL', (err) => {
              if (err) {
                console.warn('Warning: Could not create unique index for discord_user_id:', err.message);
              }
              callback(null);
            });
          }
        });
      });
    });
  }

  createDiscordTables(resolve, reject) {
    const tables = [
      {
        name: 'discord_auth_tokens',
        sql: `
          CREATE TABLE IF NOT EXISTS discord_auth_tokens (
            user_id INTEGER PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type TEXT DEFAULT 'Bearer',
            expires_at DATETIME,
            scope TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'discord_command_logs',
        sql: `
          CREATE TABLE IF NOT EXISTS discord_command_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_user_id TEXT NOT NULL,
            user_id INTEGER,
            command_name TEXT NOT NULL,
            command_options TEXT,
            success INTEGER NOT NULL,
            error_message TEXT,
            response_time_ms INTEGER,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
          )
        `
      },
      {
        name: 'discord_guilds',
        sql: `
          CREATE TABLE IF NOT EXISTS discord_guilds (
            guild_id TEXT PRIMARY KEY,
            guild_name TEXT NOT NULL,
            bot_added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            settings TEXT
          )
        `
      }
    ];

    let created = 0;
    tables.forEach(table => {
      this.db.db.run(table.sql, (err) => {
        if (err) {
          console.error(`Error creating ${table.name} table:`, err);
          return reject(err);
        }
        
        console.log(`Created/verified ${table.name} table`);
        created++;
        
        if (created === tables.length) {
          console.log('Discord database extension completed successfully');
          
          // Create indexes for better performance
          this.createIndexes(() => {
            resolve();
          });
        }
      });
    });
  }

  createIndexes(callback) {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_discord_command_logs_discord_user_id ON discord_command_logs(discord_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_discord_command_logs_command_name ON discord_command_logs(command_name)',
      'CREATE INDEX IF NOT EXISTS idx_discord_command_logs_executed_at ON discord_command_logs(executed_at)'
    ];

    let created = 0;
    indexes.forEach(indexSQL => {
      this.db.db.run(indexSQL, (err) => {
        if (err) {
          console.error('Error creating index:', err);
        }
        
        created++;
        if (created === indexes.length) {
          console.log('Discord database indexes created');
          callback();
        }
      });
    });
  }

  // Helper methods for Discord integration

  // Get user by Discord ID
  getUserByDiscordId(discordUserId, callback) {
    const query = 'SELECT * FROM users WHERE discord_user_id = ?';
    this.db.db.get(query, [discordUserId], callback);
  }

  // Link Discord account to user
  linkDiscordAccount(userId, discordUser, callback) {
    const query = `
      UPDATE users 
      SET discord_user_id = ?, 
          discord_username = ?, 
          discord_avatar = ?, 
          discord_linked_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    this.db.db.run(query, [
      discordUser.id,
      `${discordUser.username}#${discordUser.discriminator}`,
      discordUser.avatar,
      userId
    ], callback);
  }

  // Unlink Discord account
  unlinkDiscordAccount(userId, callback) {
    const query = `
      UPDATE users 
      SET discord_user_id = NULL, 
          discord_username = NULL, 
          discord_avatar = NULL, 
          discord_linked_at = NULL 
      WHERE id = ?
    `;
    
    this.db.db.run(query, [userId], callback);
  }

  // Store Discord tokens
  storeDiscordTokens(userId, tokens, callback) {
    const query = `
      INSERT OR REPLACE INTO discord_auth_tokens 
      (user_id, access_token, refresh_token, token_type, expires_at, scope, updated_at) 
      VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'), ?, CURRENT_TIMESTAMP)
    `;
    
    this.db.db.run(query, [
      userId,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.token_type || 'Bearer',
      tokens.expires_in || 3600,
      tokens.scope || 'identify'
    ], callback);
  }

  // Log Discord command usage
  logDiscordCommand(discordUserId, userId, commandName, commandOptions, success, errorMessage, responseTime, callback) {
    const query = `
      INSERT INTO discord_command_logs 
      (discord_user_id, user_id, command_name, command_options, success, error_message, response_time_ms) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    this.db.db.run(query, [
      discordUserId,
      userId,
      commandName,
      JSON.stringify(commandOptions),
      success ? 1 : 0,
      errorMessage,
      responseTime
    ], callback || (() => {}));
  }

  // Get Discord link status
  getDiscordLinkStatus(userId, callback) {
    const query = `
      SELECT discord_user_id, discord_username, discord_avatar, discord_linked_at 
      FROM users WHERE id = ?
    `;
    
    this.db.db.get(query, [userId], (err, result) => {
      if (err) return callback(err);
      
      if (result) {
        callback(null, {
          isLinked: !!result.discord_user_id,
          discordUserId: result.discord_user_id,
          discordUsername: result.discord_username,
          discordAvatar: result.discord_avatar,
          linkedAt: result.discord_linked_at
        });
      } else {
        callback(new Error('User not found'));
      }
    });
  }
}

module.exports = DiscordDatabaseExtension;
