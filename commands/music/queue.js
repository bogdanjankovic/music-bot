const { SlashCommandBuilder } = require('discord.js');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Shows the current music queue'),
    async execute(interaction) {
        const serverQueue = queue.get(interaction.guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('The queue is empty.');

        const currentSong = serverQueue.songs[0];
        const nextSongs = serverQueue.songs.slice(1, 10); // Show next 9 songs

        let queueString = `__**Now Playing:**__\n${currentSong.title}\n\n__**Up Next:**__\n`;

        if (nextSongs.length > 0) {
            nextSongs.forEach((song, index) => {
                queueString += `${index + 1}. ${song.title}\n`;
            });

            if (serverQueue.songs.length > 10) {
                queueString += `\n...and ${serverQueue.songs.length - 10} more.`;
            }
        } else {
            queueString += "No more songs in queue.";
        }

        await interaction.reply({ content: queueString, ephemeral: true });
    },
};
