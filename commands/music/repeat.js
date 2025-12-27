const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Toggles repeating the current song'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        if (!serverQueue) return interaction.reply('There is no music playing!');

        // If currently repeating song (1), turn off (0). Otherwise set to repeat song (1).
        if (serverQueue.loopMode === 1) {
            serverQueue.loopMode = 0;
            return interaction.reply('🔂 Repeat Song is now **OFF**');
        } else {
            serverQueue.loopMode = 1;
            return interaction.reply('🔂 Repeat Song is now **ON**');
        }
    },
};
