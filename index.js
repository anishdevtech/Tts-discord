// index.js
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, EndBehaviorType } = require('@discordjs/voice');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const Vosk = require('vosk');
const { exec } = require('child_process');

const MODEL_PATH = 'path_to_vosk_model';  // Replace with the path to your Vosk model
const TEMP_AUDIO_FILE = 'temp_audio.wav';

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

Vosk.setLogLevel(0);
const model = new Vosk.Model(MODEL_PATH);

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.content === '!join') {
        const channel = message.member.voice.channel;
        if (channel) {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            const receiver = connection.receiver;

            receiver.speaking.on('start', userId => {
                const audioStream = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.Manual } });
                const pcmStream = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 16000 });

                audioStream.pipe(pcmStream);

                const writeStream = fs.createWriteStream(TEMP_AUDIO_FILE);
                pcmStream.pipe(writeStream);

                pcmStream.on('end', () => {
                    writeStream.close();

                    ffmpeg(TEMP_AUDIO_FILE)
                        .inputFormat('wav')
                        .audioCodec('pcm_s16le')
                        .audioChannels(1)
                        .audioFrequency(16000)
                        .format('wav')
                        .on('end', () => {
                            const rec = new Vosk.Recognizer({ model: model, sampleRate: 16000 });
                            const audio = fs.readFileSync(TEMP_AUDIO_FILE);
                            const buffer = Buffer.from(audio);

                            rec.acceptWaveform(buffer);
                            const result = rec.finalResult();
                            const transcription = JSON.parse(result).text;

                            if (transcription) {
                                exec(`gtts-cli '${transcription}' --output response.mp3`, (error, stdout, stderr) => {
                                    if (error) {
                                        console.error(`exec error: ${error}`);
                                        return;
                                    }
                                    
                                    const player = createAudioPlayer();
                                    const resource = createAudioResource('response.mp3');
                                    player.play(resource);
                                    connection.subscribe(player);
                                });
                            }
                        })
                        .save(TEMP_AUDIO_FILE);
                });
            });
        } else {
            message.reply('You need to join a voice channel first!');
        }
    }
});

client.login('');
