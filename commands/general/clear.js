const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Deletes a specified number of messages from the channel.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        await interaction.deferReply({ ephemeral: true });

        // Fetch recent messages (up to 100)
        const messages = await interaction.channel.messages.fetch({ limit: 100 });

        // Filter for messages sent by the bot (or interactions triggered by the user if possible, but mainly bot responses)
        const botMessages = messages.filter(msg => msg.author.id === interaction.client.user.id);

        // Slice to requested amount if we found more than requested, though fetch limit is 100
        const messagesToDelete = botMessages.first(amount);

        if (messagesToDelete.length === 0) {
            return interaction.editReply({ content: 'No bot messages found to clean up.' });
        }

        const deleted = await interaction.channel.bulkDelete(messagesToDelete, true).catch(err => {
            console.error(err);
            return interaction.editReply({ content: 'There was an error trying to prune messages in this channel!' });
        });

        // bulkDelete returns the Collection of deleted messages
        if (deleted) {
            return interaction.editReply({ content: `Successfully deleted \`${deleted.size}\` bot messages.` });
        }
    },
};
