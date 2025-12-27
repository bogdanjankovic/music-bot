const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, PermissionFlagsBits, OAuth2Scopes } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const queue = require('./queueMap');
const dotenv = require('dotenv');

dotenv.config();

// Auto-Leave Timer Map
const autoLeaveTimers = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
// Ensure commands directory exists
if (!fs.existsSync(foldersPath)) {
    fs.mkdirSync(foldersPath);
}

const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    const inviteLink = client.generateInvite({
        scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        permissions: [PermissionFlagsBits.Administrator],
    });
    console.log(`\nAuthorize your bot using this link:\n${inviteLink}\n`);
});

client.on(Events.InteractionCreate, async interaction => {
    console.log("Interaction received:", interaction.commandName);
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // Check if the bot's voice state changed or if someone left/joined the bot's channel
    const guildId = oldState.guild.id || newState.guild.id;
    const voiceChannel = oldState.channel || newState.channel;

    // If the channel is null (could happen if both states are null, unlikely but safe check)
    if (!voiceChannel) return;

    // Get the bot's connection to see if it's actually in this guild
    const connection = getVoiceConnection(guildId);
    if (!connection) return;

    // Find the channel the bot is currently in (could be different from the event channel if someone else moved)
    const botChannelId = connection.joinConfig.channelId;
    const botChannel = client.channels.cache.get(botChannelId);

    if (!botChannel) return;

    // Check if the bot is the only one in the channel (size === 1)
    if (botChannel.members.size === 1) {
        console.log(`Bot is alone in ${botChannel.name}, starting 1 minute timer...`);

        // If a timer already exists, don't start another one
        if (!autoLeaveTimers.has(guildId)) {
            const timer = setTimeout(() => {
                const conn = getVoiceConnection(guildId);
                if (conn) {
                    console.log(`Alone timeout reached for ${botChannel.name}. Leaving.`);
                    conn.destroy();
                    queue.delete(guildId);
                }
                autoLeaveTimers.delete(guildId);
            }, 60000); // 1 minute (60,000 ms)

            autoLeaveTimers.set(guildId, timer);
        }
    } else {
        // If there are other people, check if we have a timer to clear
        if (autoLeaveTimers.has(guildId)) {
            console.log(`Someone joined or is present in ${botChannel.name}, cancelling timer.`);
            clearTimeout(autoLeaveTimers.get(guildId));
            autoLeaveTimers.delete(guildId);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
