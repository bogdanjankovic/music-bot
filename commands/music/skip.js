const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        if (!serverQueue) return interaction.reply('There is no song that I could skip!');

        // Stop the player, which triggers the Idle event, which plays the next song
        serverQueue.player.stop();
        await interaction.reply('Skipped the song!');
    },
};
