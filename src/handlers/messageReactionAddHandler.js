const config = require('../config');
const { callGemini } = require('../services/geminiService');
const favorabilitySystem = require('../systems/favorabilitySystem');

async function onMessageReactionAdd(reaction, user) {
    // Ignore reactions from the bot itself or on messages not sent by the bot
    if (user.bot || reaction.message.author.id !== reaction.client.user.id) {
        return;
    }

    console.log(`[Reaction] ${user.username} reacted with ${reaction.emoji.name} to my message. Considering a response.`);

    const authorId = user.id;
    const authorName = user.username;
    const originalMessage = reaction.message.content;
    const emoji = reaction.emoji.name;

    const currentFavorability = favorabilitySystem.getFavorability(authorId);
    let favorabilityDescription;
    if (currentFavorability > 10) favorabilityDescription = `My relationship with them is very positive (close friend).`;
    else if (currentFavorability > 0) favorabilityDescription = `My relationship with them is positive.`;
    else if (currentFavorability < -10) favorabilityDescription = `My relationship with them is very negative (annoyed).`;
    else if (currentFavorability < 0) favorabilityDescription = `My relationship with them is negative.`;
    else favorabilityDescription = `My relationship with them is neutral.`;

    const prompt = `${config.CORE_SYSTEM_RULE}

[Your internal monologue]
My name is "${reaction.client.user.username}".
My long-term relationship with "${authorName}" (favorability score: ${currentFavorability}) means: ${favorabilityDescription}

[Scenario]
I previously sent a message: "${originalMessage}"
A moment ago, "${authorName}" reacted to that message with the emoji: ${emoji}.

I will now decide if I should even respond to this reaction. Based on my personality and feelings towards this user and their emoji, I will make a decision.

My JSON response must have three keys:
1. "shouldRespond": a boolean (true or false) indicating if I feel like responding.
2. "response": my text reply if I choose to respond. If I don't, this will be an empty string.
3. "favorabilityChange": a number from -1 to 1.

My response MUST be in ${config.BOT_LANGUAGE}. I will not add a reaction myself.

My JSON response is:`;

    const rawApiResponse = await callGemini(prompt);

    if (rawApiResponse) {
        try {
            const cleanedResponse = rawApiResponse.replace(/```json\n|```/g, '').trim();
            const apiResult = JSON.parse(cleanedResponse);
            const { shouldRespond, response, favorabilityChange } = apiResult;

            favorabilitySystem.updateFavorability(authorId, favorabilityChange);

            if (shouldRespond && response) {
                console.log(`[Reaction] Decided to respond to ${user.username}.`);
                // Prepend the mention to make sure the user is notified.
                await reaction.message.channel.send(`<@${user.id}> ${response}`);
            } else {
                console.log(`[Reaction] Decided not to respond to ${user.username}.`);
            }
        } catch (e) {
            console.error("Failed to parse Gemini response for reaction:", e, "\nRaw response:", rawApiResponse);
        }
    }
}

module.exports = { onMessageReactionAdd };
