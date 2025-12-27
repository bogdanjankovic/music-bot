const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exit')
        .setDescription('Kicks the bot from the voice channel and clears the queue'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        const connection = getVoiceConnection(interaction.guild.id);

        if (!connection) {
            return interaction.reply('I am not in a voice channel!');
        }

        if (serverQueue) {
            serverQueue.songs = [];
            serverQueue.player.stop();
            queue.delete(interaction.guild.id);
        }

        connection.destroy();
        await interaction.reply('👋 Left the voice channel!');
    },
};
