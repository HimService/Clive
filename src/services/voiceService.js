const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    AudioPlayerStatus,
    EndBehaviorType,
} = require('@discordjs/voice');
const axios = require('axios');
const googleTTS = require('google-tts-api');
const prism = require('prism-media');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const { callGemini } = require('./geminiService');
const config = require('../config');

const players = new Map();

function createWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

function calculateRMS(pcmData) {
    if (pcmData.length === 0) return 0;
    let sumOfSquares = 0;
    for (let i = 0; i < pcmData.length; i += 2) {
        if (i + 1 >= pcmData.length) break;
        const sample = pcmData.readInt16LE(i);
        sumOfSquares += (sample / 32768) * (sample / 32768);
    }
    const meanSquare = sumOfSquares / (pcmData.length / 2);
    return Math.sqrt(meanSquare);
}

async function speakText(guildId, text) {
    const connection = getVoiceConnection(guildId);
    if (!connection || !text) return;

    // Sanitize the text to remove punctuation that shouldn't be read aloud.
    const sanitizedText = text.replace(/[.,?!;:"()\[\]{}<>]/g, ' ').trim();
    if (!sanitizedText) return;

    try {
        const url = googleTTS.getAudioUrl(sanitizedText, { lang: 'zh-TW', slow: false });
        const response = await axios({ url, responseType: 'stream' });
        const resource = createAudioResource(response.data);
        
        let player = players.get(guildId);
        if (!player) {
            player = createAudioPlayer();
            players.set(guildId, player);
            connection.subscribe(player);
        }
        
        player.play(resource);
        await entersState(player, AudioPlayerStatus.Idle, 60e3);
    } catch (error) {
        console.error(`Failed to speak text: "${sanitizedText}"`, error);
    }
}

function processAudioStream(audioStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const decoder = new prism.opus.Decoder({
            rate: 48000,
            channels: 2,
            frameSize: 960,
        });

        const pcmStream = audioStream.pipe(decoder);
        
        pcmStream.on('data', (chunk) => chunks.push(chunk));
        pcmStream.on('end', () => resolve(Buffer.concat(chunks)));
        pcmStream.on('error', (err) => {
            console.error("Error during Opus decoding:", err);
            reject(err);
        });
    });
}

async function handleUserSpeech(userId, user, audioStream, guildId) {
    try {
        console.log(`[VC] Processing audio stream for ${user.username}...`);
        const pcmData = await processAudioStream(audioStream);
        const rms = calculateRMS(pcmData);
        console.log(`[VC] Audio stream processed. Size: ${pcmData.length}, RMS: ${rms.toFixed(4)}`);

        if (pcmData.length > 48000 * 0.5 && rms > config.RMS_THRESHOLD) {
            // Bug Fix: The original code incorrectly set channels to 1. Opus is 2 channels.
            const header = createWavHeader(pcmData.length, 48000, 2, 16); 
            const wavBuffer = Buffer.concat([header, pcmData]);
            const audioBase64 = wavBuffer.toString('base64');

            console.log(`[VC] Audio is valid, sending for transcription.`);
            const audioData = { mime_type: 'audio/wav', data: audioBase64 };
            const sttPrompt = "Transcribe the following audio. Respond with ONLY the transcribed text, without any additional explanatory words, labels, or formatting. For example, if the user says 'hello', your entire response should be just 'hello'.";
            const transcript = await callGemini(sttPrompt, { audio: audioData });

            if (transcript) {
                console.log(`[VC] Transcription: "${transcript}"`);
                const responsePrompt = `${config.CORE_SYSTEM_RULE}\n\n[Your internal monologue]\nI'm in a voice chat with "${user.username}". They just said: "${transcript}". I will now respond to them in a natural, conversational way, continuing the persona. My response MUST be in ${config.BOT_LANGUAGE}.\n\nMy response:`;
                
                const voiceResponseReply = await callGemini(responsePrompt);
                
                if (voiceResponseReply) {
                    console.log(`[VC] Speaking response: "${voiceResponseReply}"`);
                    await speakText(guildId, voiceResponseReply);
                } else {
                    console.log(`[VC] Failed to generate a voice response.`);
                }
            } else {
                console.log(`[VC] Transcription failed or returned empty.`);
            }
        } else {
            console.log(`[VC] Audio stream too short or quiet. Ignoring.`);
        }
    } catch (error) {
        console.error("[VC] Error processing user speech:", error);
    }
}

module.exports = {
    speakText,
    handleUserSpeech,
    players
};
