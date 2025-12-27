const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Toggles looping the entire queue'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        if (!serverQueue) return interaction.reply('There is no music playing!');

        // If currently looping queue (2), turn off (0). Otherwise set to queue loop (2).
        if (serverQueue.loopMode === 2) {
            serverQueue.loopMode = 0;
            return interaction.reply('🔁 Queue Loop is now **OFF**');
        } else {
            serverQueue.loopMode = 2;
            return interaction.reply('🔁 Queue Loop is now **ON**');
        }
    },
};
