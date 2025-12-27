const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const ytDlp = require('yt-dlp-exec'); // Keep for types or util if needed, but we spawn manually usually
// We will spawn the binary directly.

const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { queue } = require('../../queueMap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song from YouTube or Spotify')
        .addStringOption(option =>
            option.setName('query')
                .setDescription(' The song URL or name to search for')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('You need to be in a voice channel to play music!');
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.editReply('I need the permissions to join and speak in your voice channel!');
        }

        const serverQueue = queue.get(interaction.guild.id);

        // Check if play-dl has been authorized (for spotify mostly, but public works for some)
        // For Spotify play-dl usually checks for specific handling. 
        // We will assume default behavior for now which handles YT search well.

        let songInfo;
        try {
            const validation = await play.validate(query);

            if (validation === 'yt_video' || validation === 'yt_playlist') {
                if (validation === 'yt_playlist') {
                    const playlist = await play.playlist_info(query, { incomplete: true });
                    // ensure we fetch videos
                    const videos = await playlist.all_videos();
                    const songs = videos.map(video => ({
                        title: video.title,
                        url: video.url,
                        duration: video.durationRaw
                    }));

                    handleQueue(interaction, voiceChannel, songs, true);
                    return;
                } else {
                    const video = await play.video_info(query);
                    songInfo = {
                        title: video.video_details.title,
                        url: video.video_details.url,
                        duration: video.video_details.durationRaw
                    };
                }
            } else if (validation === 'sp_track' || validation === 'sp_playlist' || validation === 'sp_album') {
                if (play.is_expired()) {
                    await play.refreshToken();
                }

                if (validation === 'sp_playlist' || validation === 'sp_album') {
                    // Adding this requires more complex handling as play-dl gets spotify data but needs to bridge to YT for audio
                    // Simple implementation:
                    const data = await play.spotify(query);
                    const tracks = await data.all_tracks();

                    const songs = tracks.map(track => ({
                        title: `${track.name} - ${track.artists[0].name}`,
                        url: null, // We will search this on YT when playing
                        spotifyWait: true,
                        duration: null
                    }));
                    handleQueue(interaction, voiceChannel, songs, true);
                    return;

                } else {
                    const data = await play.spotify(query);
                    songInfo = {
                        title: `${data.name} - ${data.artists[0].name}`,
                        url: null,
                        spotifyWait: true,
                        duration: null
                    };
                }
            } else if (validation === 'search') {
                // If it's a search term use yt-search
                const results = await ytSearch(query);
                if (!results || !results.videos || results.videos.length === 0) return interaction.editReply('No results found for that query.');

                const video = results.videos[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.timestamp
                };
            } else {
                // Try search as fallback
                const results = await ytSearch(query);
                if (results && results.videos.length > 0) {
                    const video = results.videos[0];
                    songInfo = {
                        title: video.title,
                        url: video.url,
                        duration: video.timestamp
                    };
                } else {
                    return interaction.editReply('Could not find that song or support that URL type.');
                }
            }
        } catch (e) {
            console.error(e);
            return interaction.editReply(`Error finding song: ${e.message}`);
        }

        handleQueue(interaction, voiceChannel, [songInfo], false);

    },
};

async function handleQueue(interaction, voiceChannel, songs, isPlaylist) {
    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
        const queueContruct = {
            textChannel: interaction.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true,
            loopMode: 0, // 0 = off, 1 = song, 2 = queue
            disconnectTimer: null,
            player: createAudioPlayer()
        };

        queue.set(interaction.guild.id, queueContruct);
        queueContruct.songs.push(...songs);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: false,
            });

            connection.on('stateChange', (oldState, newState) => {
                console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
            });

            queueContruct.connection = connection;

            // Subscribe the connection to the player
            connection.subscribe(queueContruct.player);

            // Player listeners
            queueContruct.player.on(AudioPlayerStatus.Idle, () => {
                const finishedSong = queueContruct.songs[0];
                if (queueContruct.loopMode === 1) {
                    // Repeat Song: Do not shift, just replay
                    // songs[0] remains the same
                } else if (queueContruct.loopMode === 2) {
                    // Loop Queue: Move finished song to end
                    queueContruct.songs.shift();
                    queueContruct.songs.push(finishedSong);
                } else {
                    // Off: Remove finished song
                    queueContruct.songs.shift();
                }

                playSong(interaction.guild, queueContruct.songs[0]);
            });

            queueContruct.player.on('error', error => {
                console.error(`Error: ${error.message} with resource`);
                // Skip on error
                queueContruct.songs.shift();
                playSong(interaction.guild, queueContruct.songs[0]);
            });

            queueContruct.player.on('stateChange', (oldState, newState) => {
                console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
            });

            queueContruct.player.on('error', error => {
                console.error(`Audio Player Error: ${error.message} with resource`);
            });

            playSong(interaction.guild, queueContruct.songs[0]);

            if (isPlaylist) {
                await interaction.editReply(`✅ Added **${songs.length}** songs to the queue!`);
            } else {
                await interaction.editReply(`🎶 Start playing: **${songs[0].title}**`);
            }

        } catch (err) {
            console.log(err);
            queue.delete(interaction.guild.id);
            return interaction.editReply(`Error joining voice channel: ${err.message}`);
        }
    } else {
        serverQueue.songs.push(...songs);
        if (isPlaylist) {
            interaction.editReply(`✅ **${songs.length}** songs have been added to the queue!`);
        } else {
            interaction.editReply(`✅ **${songs[0].title}** has been added to the queue!`);
        }

        // Fix: If the player is idle (e.g. after /stop), we must restart playback
        if (serverQueue.player.state.status === AudioPlayerStatus.Idle && serverQueue.songs.length > 0) {
            console.log("Queue was existing but Idle, restarting playback...");
            playSong(interaction.guild, serverQueue.songs[0]);
        }
    }
}

async function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (serverQueue.disconnectTimer) {
        clearTimeout(serverQueue.disconnectTimer);
        serverQueue.disconnectTimer = null;
    }

    if (!song) {
        serverQueue.disconnectTimer = setTimeout(() => {
            if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                serverQueue.connection.destroy();
                serverQueue.textChannel.send('👋 Left the voice channel due to inactivity.');
            }
            queue.delete(guild.id);
        }, 120000); // 2 minutes
        return;
    }

    try {
        let streamUrl;

        if (song.spotifyWait) {
            const results = await ytSearch(song.title);
            if (results && results.videos.length > 0) {
                song.url = results.videos[0].url; // update url for reference
            } else {
                serverQueue.textChannel.send(`Could not find a YouTube match for ${song.title}, skipping.`);
                serverQueue.songs.shift();
                playSong(guild, serverQueue.songs[0]);
                return;
            }
        }

        console.log(`Starting stream for ${song.title} using yt-dlp -> ffmpeg pipe...`);

        // Spawn yt-dlp to stream data to stdout
        const ytDlpProcess = spawn('yt-dlp', [
            song.url,
            '-o', '-',
            '-q',
            '-f', 'bestaudio',
            '--no-warnings',
            '--no-check-certificates',
            '--prefer-free-formats',
            '--youtube-skip-dash-manifest'
        ]);

        ytDlpProcess.on('error', err => {
            console.error('yt-dlp process error:', err);
        });

        // Spawn FFmpeg to read from stdin (pipe:0) and output raw PCM to stdout
        const ffmpegProcess = spawn('ffmpeg', [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', 'pipe:0',      // Read from stdin (which will be yt-dlp's stdout)
            '-f', 's16le',       // Output: Signed 16-bit PCM (Little Endian)
            '-ar', '48000',      // Rate: 48kHz
            '-ac', '2',          // Channels: Stereo
            'pipe:1'             // Output to stdout
        ]);

        // Pipe yt-dlp output directly into FFmpeg input
        ytDlpProcess.stdout.pipe(ffmpegProcess.stdin);

        ffmpegProcess.stderr.on('data', data => {
            // Filter logs to reduce spam but keep errors
            const msg = data.toString();
            if (msg.includes('Error') || msg.includes('headers') || msg.includes('403')) {
                console.log(`FFmpeg Log: ${msg}`);
            }
        });

        ffmpegProcess.on('close', code => {
            console.log(`FFmpeg process exited with code ${code}`);
        });

        ffmpegProcess.on('error', err => {
            console.error('FFmpeg process error:', err);
        });

        // Create resource from the ffmpeg stdout stream
        // inputType: StreamType.Raw is implied if we provide a raw stream but better to specify if using createAudioResource options
        // actually for raw PCM s16le, discord.js expects us to wrapping it or use proper input type.
        // Let's rely on createAudioResource detecting or specifying inputType.
        // For raw PCM, we really should use StreamType.Raw but createAudioResource might expect Ogg/WebM/Arbitrary.
        // Actually, easiest is to let ffmpeg output 'opus' if we want, or just let createAudioResource PROBE it.
        // But probing raw PCM is hard.
        // Let's pipe as 'mp3' or 'opus' wrapper? No, simpler: 
        // Let's use the explicit FFmpeg args for *Opus* wrapping? 
        // Better yet: Just generic arbitrary input (streamUrl) but with `createAudioResource`'s own ffmpeg support?
        // THE USER ISSUE MIGHT BE FFmpeg NOT FOUND BY DISCORD.JS.
        // But I will output RAW and tell createAudioResource it is Raw.

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Raw
        });

        console.log("Resource created, playing...");
        serverQueue.player.play(resource);
        console.log("Player.play() called.");

        serverQueue.textChannel.send(`🎶 Now Playing: **${song.title}**\n🔗 **Source:** <${song.url}>`);
    } catch (error) {
        console.error(error);
        if (serverQueue) {
            serverQueue.textChannel.send(`Error playing **${song.title}**: ${error.message}`);
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        }
    }
}
