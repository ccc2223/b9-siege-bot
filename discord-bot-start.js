#!/usr/bin/env node

// discord-bot-start.js - Production-ready Discord bot startup script
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Configuration validation
const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'WEB_APP_URL',
    'API_BASE_URL'
];

console.log('🤖 BB99 Siege War Discord Bot');
console.log('===============================');

// Check for required environment variables
console.log('🔍 Checking configuration...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
        console.error(`   • ${varName}`);
    });
    console.log('');
    console.log('📝 Please update your .env file with the missing variables.');
    console.log('💡 See .env.example for reference.');
    process.exit(1);
}

// Validate web app connectivity
async function validateConnectivity() {
    console.log('🔗 Testing web app connectivity...');
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch(`${process.env.API_BASE_URL}/boxes`, {
            timeout: 5000
        });
        
        if (response.ok) {
            console.log('✅ Web app connection successful');
            return true;
        } else {
            console.warn('⚠️ Web app responded with status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Failed to connect to web app:', error.message);
        console.log('💡 Make sure the web app is running and accessible');
        return false;
    }
}

// Start the bot
async function startBot() {
    const canConnect = await validateConnectivity();
    
    if (!canConnect && process.env.NODE_ENV === 'production') {
        console.error('❌ Cannot start bot: Web app is not accessible');
        process.exit(1);
    }
    
    if (!canConnect) {
        console.warn('⚠️ Starting bot despite connectivity issues (development mode)');
    }
    
    console.log('🚀 Starting Discord bot...');
    console.log('');
    
    // Start the actual bot
    require('./discord-bot');
}

// Handle startup
startBot().catch(error => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down Discord bot gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🔄 Shutting down Discord bot gracefully...');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
