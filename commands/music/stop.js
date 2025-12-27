const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops the music and clears the queue'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        if (!serverQueue) return interaction.reply('There is no music playing!');

        serverQueue.songs = [];
        serverQueue.player.stop();
        // optionally destroy connection
        // serverQueue.connection.destroy();
        // queue.delete(interaction.guild.id);

        await interaction.reply('Stopped the music and cleared the queue!');
    },
};
