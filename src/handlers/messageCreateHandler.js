const { getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus, entersState, EndBehaviorType } = require('@discordjs/voice');
const axios = require('axios');
const urlMetadata = require('url-metadata');
const config = require('../config');
const { callGemini } = require('../services/geminiService');
const { speakText, handleUserSpeech, players } = require('../services/voiceService');
const favorabilitySystem = require('../systems/favorabilitySystem');
const memorySystem = require('../systems/memorySystem');
const { handleAdminCommand } = require('../commands/adminCommands');

// Helper function to replace user/role IDs with their names for the AI's context
function resolveMentions(text, mentions) {
    let resolvedText = text;
    if (!mentions) return resolvedText;

    mentions.users.forEach(user => {
        const mentionRegex = new RegExp(`<@!?${user.id}>`, 'g');
        resolvedText = resolvedText.replace(mentionRegex, `@${user.username}`);
    });
    mentions.roles.forEach(role => {
        const mentionRegex = new RegExp(`<@&${role.id}>`, 'g');
        resolvedText = resolvedText.replace(mentionRegex, `@${role.name}`);
    });
    mentions.channels.forEach(channel => {
        const mentionRegex = new RegExp(`<#${channel.id}>`, 'g');
        resolvedText = resolvedText.replace(mentionRegex, `#${channel.name}`);
    });
    return resolvedText;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendAsUser(channel, text, options = {}) {
    const { replyToMessage } = options;
    await channel.sendTyping();

    // Regex to split by [PAUSE] or [PAUSE=xxxx] while keeping the delimiter
    const parts = text.split(/(\[PAUSE(?:=\d+)?\])/g).filter(p => p.length > 0);
    let isFirstMessage = true;

    for (const part of parts) {
        if (part.startsWith('[PAUSE')) {
            const match = part.match(/\[PAUSE=(\d+)\]/);
            // If a duration is specified, use it. Otherwise, use a random natural delay.
            const delay = match ? parseInt(match[1], 10) : Math.random() * 1500 + 500; // 500ms to 2000ms
            await sleep(delay);
            await channel.sendTyping();
        } else {
            const messageToSend = part.trim();
            if (messageToSend) {
                if (isFirstMessage && replyToMessage) {
                    await replyToMessage.reply(messageToSend);
                } else {
                    await channel.send(messageToSend);
                }
                isFirstMessage = false;
            }
        }
    }
}

async function onMessageCreate(message, client) {
    if (message.author.bot) return;

    // Don't show typing indicator immediately, let the AI decide if it wants to respond first.

    if (message.content.startsWith('!')) {
        return handleAdminCommand(message, client);
    }

    const authorId = message.author.id;
    const authorName = message.author.username;
    let image_data = null;

    const imageAttachment = message.attachments.find(att => att.contentType?.startsWith('image/'));
    if (imageAttachment) {
        try {
            const imageResponse = await axios.get(imageAttachment.url, { responseType: 'arraybuffer' });
            image_data = {
                mime_type: imageAttachment.contentType,
                data: Buffer.from(imageResponse.data, 'binary').toString('base64')
            };
        } catch (err) {
            console.error("Failed to process image attachment:", err);
        }
    }

    let messageTextForPrompt = message.content;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.content.match(urlRegex);
    if (urls) {
        try {
            const metadata = await urlMetadata(urls[0]);
            messageTextForPrompt = `[The user sent a link with the title: "${metadata.title}"]`;
        } catch (err) {
            messageTextForPrompt = `[The user sent a link, but I couldn't fetch its details.]`;
        }
    }

    if (image_data) {
        messageTextForPrompt = message.content.trim() === ''
            ? `[The user sent an image.]`
            : `[The user sent an image and also said: "${message.content}"]`;
    }

    // Now that we have the final text, resolve any mentions within it
    messageTextForPrompt = resolveMentions(messageTextForPrompt, message.mentions);

    const currentFavorability = favorabilitySystem.getFavorability(authorId);
    const sharedMemories = memorySystem.getMemories(authorId);
    let favorabilityDescription;
    if (currentFavorability > 10) favorabilityDescription = `My relationship with them is very positive (close friend).`;
    else if (currentFavorability > 0) favorabilityDescription = `My relationship with them is positive.`;
    else if (currentFavorability < -10) favorabilityDescription = `My relationship with them is very negative (annoyed).`;
    else if (currentFavorability < 0) favorabilityDescription = `My relationship with them is negative.`;
    else favorabilityDescription = `My relationship with them is neutral.`;

    const basePrompt = `${config.CORE_SYSTEM_RULE}\n\n[Your internal monologue]\nMy name is "${client.user.username}". People usually call me that. I should try to use my name naturally in conversation when it feels right, so people know who I am.\nI am currently in the channel #${message.channel.name}.\nMy long-term relationship with "${authorName}" (favorability score: ${currentFavorability}) means: ${favorabilityDescription}\n${sharedMemories.length > 0 ? `Here are some of my memories with them: \n- ${sharedMemories.join('\n- ')}\n` : ''}Based on our history and the current conversation, I will act as a real, spontaneous person. I can be unpredictable, ask my own questions, or change topics if I feel like it. My response should feel genuine, not like a programmed AI.`;

    const messages = await message.channel.messages.fetch({ limit: 10 });
    const history = [];
    // Messages are fetched newest to oldest. We iterate through them.
    for (const m of messages.values()) {
        // If we find a reset command from the user, we stop building the history.
        if (m.author.id === authorId && m.content.startsWith('!reset')) {
            break;
        }
        let content = m.id === message.id ? messageTextForPrompt : m.content;
        // Resolve mentions for each historical message to give the AI proper context
        content = resolveMentions(content, m.mentions);
        history.push(`${m.author.username}: ${content}`);
    }
    // The history array is currently in reverse chronological order (newest->oldest).
    // We reverse it to get the correct chronological order for the prompt.
    const conversationHistory = history.reverse().join('\n');
    let responsePrompt = `${basePrompt}\nThe recent chat history is:\n${conversationHistory}`;

    const connection = getVoiceConnection(message.guild.id);
    const isVCActionPossible = !!message.member?.voice?.channel;

    let shouldRespond = true;
    if (config.REJECTION_SYSTEM_ENABLED) {
        // Pre-computation prompt to decide if the bot should even respond.
        const prePrompt = `[Your internal monologue]\nMy name is "${client.user.username}".\nMy relationship with "${authorName}" is: ${favorabilityDescription}\nThey just said: "${messageTextForPrompt}".\nBased on my personality and our relationship, do I feel like responding to this? A simple 'yes' or 'no' is not enough. I need to decide if I should engage.\n\n[Task]\nGenerate a JSON object with a single key "shouldRespond" which is a boolean (true/false).`;

        const preResponse = await callGemini(prePrompt, { image: image_data });
        try {
            const preApiResult = JSON.parse(preResponse.replace(/```json\n|```/g, '').trim());
            shouldRespond = preApiResult.shouldRespond;
        } catch (e) {
            console.error("Failed to parse pre-response:", e, "\nRaw response:", preResponse);
            // Default to not responding if the pre-check fails.
            shouldRespond = false;
        }

        if (!shouldRespond) {
            console.log(`[AI Decision] Decided to ignore message from ${authorName} in #${message.channel.name}.`);
            // Optionally, update favorability even when not responding.
            // For now, we don't, to make ignoring a neutral action.
            return;
        }
    }

    // If we decided to respond, now we show the typing indicator.
    message.channel.sendTyping();

    responsePrompt += `\n\nI have decided to respond. I will now decide my action. My response MUST be in ${config.BOT_LANGUAGE}. My action can be sending a text message, adding a reaction emoji to the user's message, or both. To make my speech less robotic, my use of punctuation can be casual, like how people text online—maybe I'll skip a period at the end of a sentence or use an emoji instead. I will construct a JSON object to represent my action. The JSON must have a "favorabilityChange" key (a number from -1 to 1). It can optionally have a "response" key with my text reply, and/or a "reaction" key with a single emoji. After this interaction, I will also create a short memory about it. The JSON must also include a "newMemory" key containing a brief, first-person summary of this interaction (e.g., "I joked with them about pineapple on pizza," or "They seemed happy today."). I will only include the other keys for the actions I want to perform. To make my messages feel more natural, I can split my 'response' text into multiple parts using '[PAUSE]' for a random delay or '[PAUSE=xxxx]' for a specific delay in milliseconds.`;
    
    if (config.VOICE_ENABLED) {
        if (connection) responsePrompt += ` I am currently in a voice channel. If I think the user wants me to leave, I will add 'action': 'LEAVE_VC'.`;
        else if (isVCActionPossible) responsePrompt += ` If I think the user wants me to join their voice channel, I will add 'action': 'JOIN_VC', and also add a 'voiceResponse' field for what I should say when I join.`;
    }
    responsePrompt += ` Otherwise, I will omit the 'action' field.\n\nMy JSON response is:`;

    const rawApiResponse = await callGemini(responsePrompt, { image: image_data });

    if (rawApiResponse) {
        try {
            const cleanedResponse = rawApiResponse.replace(/```json\n|```/g, '').trim();
            const apiResult = JSON.parse(cleanedResponse);
            const { response, favorabilityChange, action, voiceResponse, reaction, newMemory } = apiResult;

            // Always update favorability
            if (typeof favorabilityChange === 'number') {
                favorabilitySystem.updateFavorability(authorId, favorabilityChange);
            }

            // Add the new memory
            if (newMemory) {
                memorySystem.addMemory(authorId, newMemory);
            }

            // React if the AI decided to
            if (reaction) {
                console.log(`[AI Decision] Decided to react with: ${reaction} in #${message.channel.name}`);
                message.react(reaction).catch(err => console.error('Failed to react:', err));
            }

            // Handle voice actions or send a text response if the AI decided to
            if (config.VOICE_ENABLED && (action === 'LEAVE_VC' || action === 'JOIN_VC')) {
                if (action === 'LEAVE_VC' && connection) {
                    if (response) await sendAsUser(message.channel, response, { replyToMessage: message });
                    await speakText(message.guild.id, "好吧，那我先走了。掰掰！");
                    connection.destroy();
                    if (players.has(message.guild.id)) {
                        players.get(message.guild.id).stop();
                        players.delete(message.guild.id);
                    }
                } else if (action === 'JOIN_VC' && isVCActionPossible) {
                    const voiceChannel = message.member.voice.channel;
                    try {
                        const newConnection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: voiceChannel.guild.id,
                            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                            selfDeaf: false,
                        });
                        await entersState(newConnection, VoiceConnectionStatus.Ready, 30e3);
                        if (response) await sendAsUser(message.channel, response, { replyToMessage: message });
                        await speakText(voiceChannel.guild.id, voiceResponse || "我來囉！");
                        const receiver = newConnection.receiver;
                        receiver.speaking.on('start', async (userId) => {
                            const user = client.users.cache.get(userId);
                            if (user && !user.bot) {
                                const audioStream = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } });
                                await handleUserSpeech(userId, user, audioStream, voiceChannel.guild.id);
                            }
                        });
                        newConnection.on(VoiceConnectionStatus.Disconnected, () => {
                            if (players.has(voiceChannel.guild.id)) {
                                players.get(voiceChannel.guild.id).stop();
                                players.delete(voiceChannel.guild.id);
                            }
                        });
                    } catch (error) {
                        console.error(error);
                        await sendAsUser(message.channel, "呃，我好像進不去... 檢查一下我的權限？", { replyToMessage: message });
                    }
                }
            } else if (response) {
                console.log(`[AI Decision] Decided to respond with text in #${message.channel.name}.`);
                const botInSameVC = config.VOICE_ENABLED && connection && message.member?.voice?.channelId === connection.joinConfig.channelId;
                if (botInSameVC) {
                    await speakText(message.guild.id, response);
                } else {
                    await sendAsUser(message.channel, response, { replyToMessage: Math.random() < 0.5 ? message : null });
                }
            } else {
                console.log(`[AI Decision] No text response provided in #${message.channel.name} (might have been reaction-only).`);
            }
        } catch (e) {
            console.error("Failed to parse Gemini response as JSON:", e, "\nRaw response:", rawApiResponse);
            // Avoid sending raw response if it's not a fallback scenario
        }
    }
}

module.exports = { onMessageCreate };
