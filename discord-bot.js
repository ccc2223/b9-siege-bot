// discord-bot-interactive.js - Enhanced Discord Bot with Interactive Box Management
require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ButtonStyle,
    ComponentType,
    ActivityType,
    Events
} = require('discord.js');
const fetch = require('node-fetch');

// Configuration
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ],
    failIfNotExists: false,
    allowedMentions: {
        parse: ['users'],
        repliedUser: false
    }
});

// Command collection and interaction state storage
client.commands = new Collection();
const interactionStates = new Map(); // Store temporary interaction states

/**
 * Handle viewing all boxes with status information
 */
async function handleAllBoxes(interaction, user) {
    const limit = interaction.options.getInteger('limit') || 10;
    const boxes = await getBoxes();
    
    if (boxes.length === 0) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle('📦 All Boxes')
                    .setDescription('No boxes found in the system.')
            ],
            ephemeral: true
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📦 All Boxes Overview')
        .setDescription(`Showing ${Math.min(limit, boxes.length)} of ${boxes.length} total boxes`);
    
    boxes.slice(0, limit).forEach(box => {
        const conditions = [
            box.condition1,
            box.condition2,
            box.condition3,
            box.condition4
        ].filter(c => c && c.trim() !== '');
        
        // Determine box status
        let statusText = '';
        let statusEmoji = '';
        
        if (box.current_holder) {
            statusEmoji = '🔒';
            statusText = `**Status:** Occupied by **${box.current_holder}**`;
            
            // Show holder's conditions if available
            if (box.holder_conditions) {
                try {
                    const holderConditions = JSON.parse(box.holder_conditions);
                    statusText += `\n**Holder's Conditions:** ${holderConditions.join(', ')}`;
                } catch (e) {
                    statusText += `\n**Holder's Conditions:** ${box.holder_conditions}`;
                }
            }
        } else {
            statusEmoji = '🆓';
            statusText = '**Status:** Available';
        }
        
        // Add pending applications info
        if (box.pending_applications) {
            const applicants = box.pending_applications.split(',').filter(app => app.trim());
            if (applicants.length > 0) {
                statusText += `\n📝 **Pending Applications (${applicants.length}):** ${applicants.join(', ')}`;
            }
        }
        
        // Create field value
        let fieldValue = `${statusText}\n\n**Available Conditions:**\n${conditions.map(c => `• ${c}`).join('\n')}`;
        
        // Add action suggestions based on status
        if (!box.current_holder) {
            fieldValue += `\n\n*Use \`/boxes hold ${box.id}\` or \`/boxes apply ${box.id}\`*`;
        } else if (box.current_holder !== user.username) {
            fieldValue += `\n\n*Use \`/boxes apply ${box.id}\` to apply*`;
        } else {
            fieldValue += `\n\n*This is your box! 🎯*`;
        }
        
        embed.addFields({
            name: `${statusEmoji} Box #${box.id}`,
            value: fieldValue,
            inline: false
        });
    });
    
    // Add summary footer
    const occupiedCount = boxes.filter(b => b.current_holder).length;
    const availableCount = boxes.length - occupiedCount;
    const userBoxCount = boxes.filter(b => b.current_holder === user.username).length;
    
    embed.setFooter({ 
        text: `📊 Summary: ${occupiedCount} occupied, ${availableCount} available • You hold: ${userBoxCount}` 
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Utility function to get user by Discord ID from the web app API
 */
async function getLinkedUser(discordUserId) {
    try {
        const response = await fetch(`${API_BASE_URL}/discord/user/${discordUserId}`);
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Error fetching linked user:', error);
        return null;
    }
}

/**
 * Log command usage for analytics and debugging
 */
async function logCommandUsage(interaction, success = true, errorMessage = null, responseTime = 0) {
    try {
        const logData = {
            discordUserId: interaction.user.id,
            commandName: interaction.commandName || interaction.customId,
            commandOptions: JSON.stringify(interaction.options?.data || {}),
            success: success,
            errorMessage: errorMessage,
            responseTime: responseTime,
            guildId: interaction.guild?.id || null,
            channelId: interaction.channel?.id || null
        };
        
        fetch(`${API_BASE_URL}/discord/log-command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
        }).catch(err => {
            console.error('Failed to log command usage:', err);
        });
        
    } catch (error) {
        console.error('Error in command logging:', error);
    }
}

/**
 * Utility function to get boxes data from the web app API
 */
async function getBoxes() {
    try {
        const response = await fetch(`${API_BASE_URL}/boxes`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Error fetching boxes:', error);
        return [];
    }
}

/**
 * Submit application to web app API
 */
async function submitApplication(boxId, discordUserId, conditions, isHold = false) {
    try {
        const endpoint = isHold ? 'hold' : 'apply';
        const response = await fetch(`${API_BASE_URL}/discord/boxes/${boxId}/${endpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                conditions: conditions,
                discordUserId: discordUserId 
            })
        });
        
        const result = await response.json();
        return { success: response.ok, data: result };
    } catch (error) {
        console.error('Error submitting application:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Middleware to verify user authentication
 */
async function requireLinkedAccount(interaction) {
    const user = await getLinkedUser(interaction.user.id);
    
    if (!user) {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Account Not Linked')
            .setDescription(`Your Discord account is not linked to BB99 Siege War.\n\n**To link your account:**\n1. Visit ${WEB_APP_URL}\n2. Log in to your account\n3. Click "Link Discord Account" on the main page`)
            .addFields(
                { name: '🔗 Why Link?', value: 'Linking allows you to manage boxes, view your profile, and access all bot features.', inline: false },
                { name: '🛡️ Security', value: 'Your Discord account will be securely connected to your BB99 account.', inline: false }
            )
            .setFooter({ text: 'Account linking is required to use bot commands' });
            
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        await logCommandUsage(interaction, false, 'Account not linked');
        return null;
    }
    
    return user;
}

/**
 * Format date for display
 */
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Create condition selection interface
 */
function createConditionSelection(boxId, conditions, action = 'apply') {
    const embed = new EmbedBuilder()
        .setColor(action === 'apply' ? 0x0099FF : 0x00FF00)
        .setTitle(`${action === 'apply' ? '📝 Apply for' : '🎯 Hold'} Box #${boxId}`)
        .setDescription('Select which conditions you meet:')
        .addFields(
            { name: '📋 Available Conditions', value: conditions.map((c, i) => `**${i + 1}.** ${c}`).join('\n'), inline: false },
            { name: '⚠️ Important', value: 'You must select at least one condition that you meet.', inline: false }
        );

    // Create buttons for each condition
    const rows = [];
    const buttonsPerRow = 2;
    
    for (let i = 0; i < conditions.length; i += buttonsPerRow) {
        const row = new ActionRowBuilder();
        
        for (let j = i; j < Math.min(i + buttonsPerRow, conditions.length); j++) {
            const button = new ButtonBuilder()
                .setCustomId(`condition_${boxId}_${j}_${action}`)
                .setLabel(`Condition ${j + 1}`)
                .setStyle(ButtonStyle.Secondary);
            
            row.addComponents(button);
        }
        
        rows.push(row);
    }
    
    // Add confirm and cancel buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${action}_${boxId}`)
                .setLabel(`Confirm ${action === 'apply' ? 'Application' : 'Hold'}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true), // Initially disabled until conditions are selected
            new ButtonBuilder()
                .setCustomId(`cancel_${action}_${boxId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );
    
    rows.push(actionRow);
    
    return { embeds: [embed], components: rows };
}

/**
 * Command: /link - Check account linking status
 */
const linkCommand = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Check your account linking status or get instructions to link your account'),
        
    async execute(interaction) {
        try {
            const user = await getLinkedUser(interaction.user.id);
            
            if (user) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Account Linked')
                    .addFields(
                        { name: 'Username', value: user.username, inline: true },
                        { name: 'User Level', value: user.userLevel, inline: true },
                        { name: 'Linked Since', value: formatDate(user.discordLinkedAt), inline: true }
                    )
                    .setFooter({ text: 'You can now use all bot commands!' });
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle('🔗 Link Your Account')
                    .setDescription(`Your Discord account is not yet linked to BB99 Siege War.`)
                    .addFields(
                        { name: '📋 Steps to Link:', value: `1. Visit ${WEB_APP_URL}\n2. Log in to your account\n3. Click "Link Discord Account"\n4. Authorize the connection`, inline: false },
                        { name: '🎯 Why Link?', value: 'Linking allows you to manage boxes, apply for positions, and access your account directly from Discord.', inline: false }
                    )
                    .setFooter({ text: 'Linking is secure and can be undone at any time' });
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
        } catch (error) {
            console.error('Link command error:', error);
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while checking your account status. Please try again later.')
                ],
                ephemeral: true
            });
        }
    }
};

/**
 * Command: /profile - Show user profile information
 */
const profileCommand = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your profile information and statistics'),
        
    async execute(interaction) {
        try {
            const user = await requireLinkedAccount(interaction);
            if (!user) return;
            
            const boxes = await getBoxes();
            const assignedBoxes = boxes.filter(box => box.current_holder === user.username);
            const availableBoxes = boxes.filter(box => !box.current_holder);
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('👤 Your Profile')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎯 Username', value: user.username, inline: true },
                    { name: '🏅 User Level', value: user.userLevel, inline: true },
                    { name: '🔗 Discord', value: user.discordUsername, inline: true },
                    { name: '📦 Boxes Held', value: assignedBoxes.length.toString(), inline: true },
                    { name: '🆓 Available Boxes', value: availableBoxes.length.toString(), inline: true },
                    { name: '📊 Total Boxes', value: boxes.length.toString(), inline: true },
                    { name: '🗓️ Linked Since', value: formatDate(user.discordLinkedAt), inline: false }
                )
                .setFooter({ text: 'Use /boxes to manage your boxes' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('Profile command error:', error);
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Error')
                        .setDescription('Failed to retrieve profile information. Please try again later.')
                ],
                ephemeral: true
            });
        }
    }
};

/**
 * Command: /boxes - Manage boxes
 */
const boxesCommand = {
    data: new SlashCommandBuilder()
        .setName('boxes')
        .setDescription('Manage your boxes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('View all boxes with their current status and holders')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of boxes to show (default: 10, max: 18)')
                        .setMinValue(1)
                        .setMaxValue(18)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your assigned boxes')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('available')
                .setDescription('View available boxes to apply for')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of boxes to show (default: 5, max: 10)')
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('apply')
                .setDescription('Apply for a specific box with interactive condition selection')
                .addIntegerOption(option =>
                    option
                        .setName('box_id')
                        .setDescription('The box number you want to apply for')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(18)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('hold')
                .setDescription('Hold an available box with interactive condition selection')
                .addIntegerOption(option =>
                    option
                        .setName('box_id')
                        .setDescription('The box number you want to hold')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(18)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View overall box statistics')
        ),
        
    async execute(interaction) {
        try {
            const user = await requireLinkedAccount(interaction);
            if (!user) return;
            
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'all':
                    await handleAllBoxes(interaction, user);
                    break;
                case 'view':
                    await handleViewBoxes(interaction, user);
                    break;
                case 'available':
                    await handleAvailableBoxes(interaction, user);
                    break;
                case 'apply':
                    await handleApplyForBox(interaction, user);
                    break;
                case 'hold':
                    await handleHoldBox(interaction, user);
                    break;
                case 'status':
                    await handleBoxesStatus(interaction, user);
                    break;
            }
            
        } catch (error) {
            console.error('Boxes command error:', error);
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while processing your request. Please try again later.')
                ],
                ephemeral: true
            });
        }
    }
};

/**
 * Handle viewing user's assigned boxes
 */
async function handleViewBoxes(interaction, user) {
    const boxes = await getBoxes();
    const userBoxes = boxes.filter(box => box.current_holder === user.username);
    
    if (userBoxes.length === 0) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle('📦 Your Boxes')
                    .setDescription('You are not currently holding any boxes.\n\nUse `/boxes available` to see boxes you can apply for!')
            ],
            ephemeral: true
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📦 Your Assigned Boxes')
        .setDescription(`You are currently holding ${userBoxes.length} box${userBoxes.length === 1 ? '' : 'es'}`);
    
    userBoxes.slice(0, 5).forEach(box => {
        const conditions = [
            box.condition1,
            box.condition2,
            box.condition3,
            box.condition4
        ].filter(c => c && c.trim() !== '');
        
        embed.addFields({
            name: `📦 Box #${box.id}`,
            value: `**Conditions:**\n${conditions.map(c => `• ${c}`).join('\n')}\n**Your Conditions:** ${box.holder_conditions || 'Not specified'}`,
            inline: false
        });
    });
    
    if (userBoxes.length > 5) {
        embed.setFooter({ text: `Showing 5 of ${userBoxes.length} boxes. Use /boxes view again to see more.` });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle viewing available boxes
 */
async function handleAvailableBoxes(interaction, user) {
    const limit = interaction.options.getInteger('limit') || 5;
    const boxes = await getBoxes();
    const availableBoxes = boxes.filter(box => !box.current_holder);
    
    if (availableBoxes.length === 0) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle('🆓 Available Boxes')
                    .setDescription('No boxes are currently available.\n\nCheck back later!')
            ],
            ephemeral: true
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🆓 Available Boxes')
        .setDescription(`${availableBoxes.length} box${availableBoxes.length === 1 ? '' : 'es'} available for application`);
    
    availableBoxes.slice(0, limit).forEach(box => {
        const conditions = [
            box.condition1,
            box.condition2,
            box.condition3,
            box.condition4
        ].filter(c => c && c.trim() !== '');
        
        const pendingText = box.pending_applications ? 
            `\n**Pending Applications:** ${box.pending_applications}` : '';
        
        embed.addFields({
            name: `📦 Box #${box.id}`,
            value: `**Conditions:**\n${conditions.map(c => `• ${c}`).join('\n')}${pendingText}\n\n*Use \`/boxes apply ${box.id}\` or \`/boxes hold ${box.id}\`*`,
            inline: true
        });
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle viewing box statistics
 */
async function handleBoxesStatus(interaction, user) {
    const boxes = await getBoxes();
    
    const totalBoxes = boxes.length;
    const occupiedBoxes = boxes.filter(box => box.current_holder).length;
    const availableBoxes = totalBoxes - occupiedBoxes;
    const userBoxes = boxes.filter(box => box.current_holder === user.username).length;
    
    const totalApplications = boxes.reduce((total, box) => {
        return total + (box.pending_applications ? box.pending_applications.split(',').length : 0);
    }, 0);
    
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📊 BB99 Siege War Statistics')
        .addFields(
            { name: '📦 Total Boxes', value: totalBoxes.toString(), inline: true },
            { name: '🔒 Occupied Boxes', value: occupiedBoxes.toString(), inline: true },
            { name: '🆓 Available Boxes', value: availableBoxes.toString(), inline: true },
            { name: '🎯 Your Boxes', value: userBoxes.toString(), inline: true },
            { name: '📝 Pending Applications', value: totalApplications.toString(), inline: true },
            { name: '📈 Occupation Rate', value: `${Math.round((occupiedBoxes / totalBoxes) * 100)}%`, inline: true }
        )
        .setFooter({ text: `Live data from BB99 Siege War` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle applying for a specific box with interactive selection
 */
async function handleApplyForBox(interaction, user) {
    const boxId = interaction.options.getInteger('box_id');
    
    try {
        const response = await fetch(`${API_BASE_URL}/boxes/${boxId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ Box Not Found')
                            .setDescription(`Box #${boxId} does not exist.`)
                    ],
                    ephemeral: true
                });
                return;
            }
            throw new Error('Failed to fetch box information');
        }
        
        const box = await response.json();
        
        // Pre-flight checks
        if (box.current_holder) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF9900)
                        .setTitle('📦 Box Already Occupied')
                        .setDescription(`Box #${boxId} is currently held by **${box.current_holder}**.`)
                        .addFields(
                            { name: '💡 Alternative', value: 'You can still apply! Applications will be reviewed by admins even for occupied boxes.', inline: false }
                        )
                ],
                ephemeral: true
            });
            // Continue with application process even for occupied boxes
        }
        
        if (box.pending_applications && box.pending_applications.includes(user.username)) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF9900)
                        .setTitle('📝 Already Applied')
                        .setDescription(`You have already applied for Box #${boxId}.`)
                        .addFields(
                            { name: '🔄 Next Steps', value: 'Wait for admin approval or visit the web app to withdraw your application.', inline: false }
                        )
                ],
                ephemeral: true
            });
            return;
        }
        
        // Show interactive condition selection
        const conditions = [
            box.condition1,
            box.condition2,
            box.condition3,
            box.condition4
        ].filter(c => c && c.trim() !== '');
        
        if (conditions.length === 0) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ No Conditions Set')
                        .setDescription(`Box #${boxId} has no conditions configured. Please contact an admin.`)
                ],
                ephemeral: true
            });
            return;
        }
        
        // Store interaction state
        interactionStates.set(interaction.user.id, {
            boxId: boxId,
            action: 'apply',
            conditions: conditions,
            selectedConditions: [],
            userId: user.id,
            timestamp: Date.now()
        });
        
        const selectionInterface = createConditionSelection(boxId, conditions, 'apply');
        await interaction.reply({ ...selectionInterface, ephemeral: true });
        
    } catch (error) {
        console.error('Apply for box error:', error);
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Error')
                    .setDescription('Failed to process your application request. Please try again later.')
            ],
            ephemeral: true
        });
    }
}

/**
 * Handle holding an available box with interactive selection
 */
async function handleHoldBox(interaction, user) {
    const boxId = interaction.options.getInteger('box_id');
    
    try {
        const response = await fetch(`${API_BASE_URL}/boxes/${boxId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ Box Not Found')
                            .setDescription(`Box #${boxId} does not exist.`)
                    ],
                    ephemeral: true
                });
                return;
            }
            throw new Error('Failed to fetch box information');
        }
        
        const box = await response.json();
        
        // Check if box is available for direct holding
        if (box.current_holder) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF9900)
                        .setTitle('📦 Box Already Occupied')
                        .setDescription(`Box #${boxId} is currently held by **${box.current_holder}**.`)
                        .addFields(
                            { name: '💡 Tip', value: 'Use `/boxes apply` to submit an application instead.', inline: false }
                        )
                ],
                ephemeral: true
            });
            return;
        }
        
        if (box.pending_applications && box.pending_applications.length > 0) {
            const applicants = box.pending_applications.split(',').filter(app => app.trim());
            
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF9900)
                        .setTitle('📝 Pending Applications')
                        .setDescription(`Box #${boxId} has ${applicants.length} pending application(s).`)
                        .addFields(
                            { name: '⚠️ Notice', value: 'For fairness, boxes with pending applications should be assigned by admins.', inline: false },
                            { name: '🌐 Alternative', value: 'Use `/boxes apply` to submit your own application.', inline: false }
                        )
                ],
                ephemeral: true
            });
            return;
        }
        
        // Show interactive condition selection for holding
        const conditions = [
            box.condition1,
            box.condition2,
            box.condition3,
            box.condition4
        ].filter(c => c && c.trim() !== '');
        
        if (conditions.length === 0) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ No Conditions Set')
                        .setDescription(`Box #${boxId} has no conditions configured. Please contact an admin.`)
                ],
                ephemeral: true
            });
            return;
        }
        
        // Store interaction state
        interactionStates.set(interaction.user.id, {
            boxId: boxId,
            action: 'hold',
            conditions: conditions,
            selectedConditions: [],
            userId: user.id,
            timestamp: Date.now()
        });
        
        const selectionInterface = createConditionSelection(boxId, conditions, 'hold');
        await interaction.reply({ ...selectionInterface, ephemeral: true });
        
    } catch (error) {
        console.error('Hold box error:', error);
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Error')
                    .setDescription('Failed to process your hold request. Please try again later.')
            ],
            ephemeral: true
        });
    }
}

// Register commands
client.commands.set(linkCommand.data.name, linkCommand);
client.commands.set(profileCommand.data.name, profileCommand);
client.commands.set(boxesCommand.data.name, boxesCommand);

// Bot event handlers
client.once('ready', async () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);
    console.log(`📋 Bot ID: ${client.user.id}`);
    console.log(`🌍 Servers: ${client.guilds.cache.size}`);
    
    client.user.setActivity('BB99 Siege War', { type: ActivityType.Playing });
    
    try {
        console.log('🔄 Registering slash commands...');
        
        const commands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
        await client.application.commands.set(commands);
        
        console.log(`✅ Successfully registered ${commands.length} slash commands with interactive features!`);
        console.log('');
        console.log('🎯 Available Commands:');
        console.log('   • /link - Check account linking status');
        console.log('   • /profile - View user profile');
        console.log('   • /boxes all - View all boxes with status');
        console.log('   • /boxes view - View your boxes');
        console.log('   • /boxes available - Browse available boxes');
        console.log('   • /boxes apply [box_id] - Apply with interactive condition selection');
        console.log('   • /boxes hold [box_id] - Hold with interactive condition selection');
        console.log('   • /boxes status - View statistics');
        console.log('');
        console.log('🎮 Interactive Features:');
        console.log('   • ✅ Condition selection with buttons');
        console.log('   • ✅ Real-time API integration');
        console.log('   • ✅ Instant feedback and results');
        
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
});

// Handle all interactions (commands and button clicks)
client.on(Events.InteractionCreate, async (interaction) => {
    const startTime = Date.now();
    
    if (interaction.isChatInputCommand()) {
        // Handle slash commands
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`❌ Command ${interaction.commandName} not found`);
            await logCommandUsage(interaction, false, 'Command not found', Date.now() - startTime);
            return;
        }
        
        try {
            await command.execute(interaction);
            const responseTime = Date.now() - startTime;
            await logCommandUsage(interaction, true, null, responseTime);
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error(`❌ Error executing ${interaction.commandName}:`, error);
            await logCommandUsage(interaction, false, error.message, responseTime);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Command Error')
                .setDescription('An unexpected error occurred while executing this command.')
                .addFields(
                    { name: '🔧 What can you do?', value: '• Try the command again\n• Use the web app instead\n• Contact an administrator if the problem persists', inline: false }
                )
                .setFooter({ text: `Error ID: ${Date.now()}-${interaction.user.id}` });
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
        
    } else if (interaction.isButton()) {
        // Handle button interactions
        await handleButtonInteraction(interaction);
    }
});

/**
 * Handle button interactions for condition selection
 */
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    // Get user state
    const userState = interactionStates.get(userId);
    if (!userState) {
        await interaction.reply({
            content: '❌ This interaction has expired. Please start over with a new command.',
            ephemeral: true
        });
        return;
    }
    
    // Check if state is too old (10 minutes)
    if (Date.now() - userState.timestamp > 10 * 60 * 1000) {
        interactionStates.delete(userId);
        await interaction.reply({
            content: '❌ This interaction has expired. Please start over with a new command.',
            ephemeral: true
        });
        return;
    }
    
    try {
        if (customId.startsWith('condition_')) {
            await handleConditionToggle(interaction, userState);
        } else if (customId.startsWith('confirm_')) {
            await handleConfirmAction(interaction, userState);
        } else if (customId.startsWith('cancel_')) {
            await handleCancelAction(interaction, userState);
        }
    } catch (error) {
        console.error('Button interaction error:', error);
        await interaction.reply({
            content: '❌ An error occurred processing your selection. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Handle condition toggle button
 */
async function handleConditionToggle(interaction, userState) {
    const parts = interaction.customId.split('_');
    const conditionIndex = parseInt(parts[2]);
    
    // Toggle condition selection
    if (userState.selectedConditions.includes(conditionIndex)) {
        userState.selectedConditions = userState.selectedConditions.filter(i => i !== conditionIndex);
    } else {
        userState.selectedConditions.push(conditionIndex);
    }
    
    // Update the message with new button states
    const updatedInterface = createUpdatedConditionSelection(userState);
    await interaction.update(updatedInterface);
}

/**
 * Handle confirm action button
 */
async function handleConfirmAction(interaction, userState) {
    if (userState.selectedConditions.length === 0) {
        await interaction.reply({
            content: '❌ You must select at least one condition before confirming.',
            ephemeral: true
        });
        return;
    }
    
    await interaction.deferUpdate();
    
    // Get selected condition text
    const selectedConditionTexts = userState.selectedConditions.map(i => userState.conditions[i]);
    
    // Submit to web app API
    const result = await submitApplication(
        userState.boxId, 
        interaction.user.id,  // Discord user ID
        selectedConditionTexts, 
        userState.action === 'hold'
    );
    
    // Clean up state
    interactionStates.delete(interaction.user.id);
    
    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`✅ ${userState.action === 'apply' ? 'Application Submitted' : 'Box Held'}`)
            .setDescription(`Successfully ${userState.action === 'apply' ? 'applied for' : 'held'} Box #${userState.boxId}!`)
            .addFields(
                { name: 'Conditions Met', value: selectedConditionTexts.map(c => `• ${c}`).join('\n'), inline: false },
                { name: 'Status', value: userState.action === 'apply' ? 'Application pending admin review' : 'Box is now yours!', inline: false }
            )
            .setFooter({ text: `Visit ${WEB_APP_URL} to manage your boxes` });
        
        await interaction.editReply({ 
            embeds: [embed], 
            components: [] // Remove buttons
        });
    } else {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`❌ ${userState.action === 'apply' ? 'Application Failed' : 'Hold Failed'}`)
            .setDescription(`Failed to ${userState.action} Box #${userState.boxId}.`)
            .addFields(
                { name: 'Error', value: result.data?.error || result.error || 'Unknown error occurred', inline: false },
                { name: '🔧 What can you do?', value: '• Try again\n• Use the web app\n• Contact an administrator', inline: false }
            );
        
        await interaction.editReply({ 
            embeds: [embed], 
            components: [] // Remove buttons
        });
    }
}

/**
 * Handle cancel action button
 */
async function handleCancelAction(interaction, userState) {
    // Clean up state
    interactionStates.delete(interaction.user.id);
    
    const embed = new EmbedBuilder()
        .setColor(0x808080)
        .setTitle('❌ Action Cancelled')
        .setDescription(`${userState.action === 'apply' ? 'Application' : 'Hold action'} for Box #${userState.boxId} has been cancelled.`)
        .addFields(
            { name: '💡 Tip', value: 'You can try again anytime with the `/boxes` commands.', inline: false }
        );
    
    await interaction.update({ 
        embeds: [embed], 
        components: [] // Remove buttons
    });
}

/**
 * Create updated condition selection interface with current selections
 */
function createUpdatedConditionSelection(userState) {
    const { boxId, conditions, selectedConditions, action } = userState;
    
    const embed = new EmbedBuilder()
        .setColor(action === 'apply' ? 0x0099FF : 0x00FF00)
        .setTitle(`${action === 'apply' ? '📝 Apply for' : '🎯 Hold'} Box #${boxId}`)
        .setDescription('Select which conditions you meet:')
        .addFields(
            { name: '📋 Available Conditions', value: conditions.map((c, i) => {
                const isSelected = selectedConditions.includes(i);
                return `${isSelected ? '✅' : '▫'} **${i + 1}.** ${c}`;
            }).join('\n'), inline: false },
            { name: '⚠️ Important', value: 'You must select at least one condition that you meet.', inline: false }
        );

    if (selectedConditions.length > 0) {
        embed.addFields({
            name: '✅ Selected Conditions',
            value: selectedConditions.map(i => `• ${conditions[i]}`).join('\n'),
            inline: false
        });
    }

    // Create buttons for each condition
    const rows = [];
    const buttonsPerRow = 2;
    
    for (let i = 0; i < conditions.length; i += buttonsPerRow) {
        const row = new ActionRowBuilder();
        
        for (let j = i; j < Math.min(i + buttonsPerRow, conditions.length); j++) {
            const isSelected = selectedConditions.includes(j);
            const button = new ButtonBuilder()
                .setCustomId(`condition_${boxId}_${j}_${action}`)
                .setLabel(`Condition ${j + 1}`)
                .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary);
            
            row.addComponents(button);
        }
        
        rows.push(row);
    }
    
    // Add confirm and cancel buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${action}_${boxId}`)
                .setLabel(`Confirm ${action === 'apply' ? 'Application' : 'Hold'}`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(selectedConditions.length === 0),
            new ButtonBuilder()
                .setCustomId(`cancel_${action}_${boxId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );
    
    rows.push(actionRow);
    
    return { embeds: [embed], components: rows };
}

// Clean up old interaction states periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, state] of interactionStates.entries()) {
        if (now - state.timestamp > 10 * 60 * 1000) { // 10 minutes
            interactionStates.delete(userId);
        }
    }
}, 5 * 60 * 1000); // Clean up every 5 minutes

// Error handling
client.on(Events.Error, error => {
    console.error('❌ Discord client error:', error);
});

client.on(Events.Warn, warning => {
    console.warn('⚠️ Discord client warning:', warning);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down Discord bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔄 Shutting down Discord bot...');
    client.destroy();
    process.exit(0);
});

// Login to Discord
if (!BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN environment variable is required');
    console.log('Please set up your .env file with Discord configuration');
    process.exit(1);
}

console.log('🔑 Bot token loaded (first 10 chars):', BOT_TOKEN.substring(0, 10) + '...');
console.log('🔗 Attempting to connect to Discord...');

const loginTimeout = setTimeout(() => {
    console.error('⏰ Login timeout after 30 seconds');
    process.exit(1);
}, 30000);

client.login(BOT_TOKEN).then(() => {
    console.log('✅ Login request sent successfully');
    clearTimeout(loginTimeout);
}).catch(error => {
    clearTimeout(loginTimeout);
    console.error('❌ Failed to login to Discord:', error.message);
    process.exit(1);
});

module.exports = client;