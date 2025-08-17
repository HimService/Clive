const config = require('../config');
const { callGemini } = require('../services/geminiService');
const { ActivityType } = require('discord.js');

let proactiveInterval;

async function startProactiveBehavior(client) {
    if (config.PROACTIVE_CHANNEL_ID === 'NONE') {
        console.log('[Proactive] Proactive mode is disabled.');
        return;
    }

    console.log(`[Proactive] Proactive mode enabled for channel: ${config.PROACTIVE_CHANNEL_ID}`);

    // Clear any existing interval to prevent duplicates
    if (proactiveInterval) {
        clearInterval(proactiveInterval);
    }

    // Function to perform proactive actions
    const performProactiveAction = async () => {
        try {
            const channel = await client.channels.fetch(config.PROACTIVE_CHANNEL_ID);
            if (!channel) {
                console.error(`[Proactive] Could not find channel with ID: ${config.PROACTIVE_CHANNEL_ID}`);
                return;
            }

            // Decide whether to send a message or change status (e.g., 50/50 chance)
            if (Math.random() < 0.5) {
                // --- Proactive Message ---
                const prompt = `${config.CORE_SYSTEM_RULE}\n\n[My internal monologue]\nMy name is ${client.user.username}. I'm in the server right now and feel like saying something. I'm not replying to anyone, just starting a conversation or sharing a thought. My message should be in ${config.BOT_LANGUAGE}.\n\nMy decision, in JSON format, is:`;
                const rawApiResponse = await callGemini(prompt);
                if (rawApiResponse) {
                    const cleanedResponse = rawApiResponse.replace(/```json\n|```/g, '').trim();
                    const apiResult = JSON.parse(cleanedResponse);
                    if (apiResult.response) {
                        console.log(`[Proactive] Sending proactive message: "${apiResult.response}"`);
                        await channel.send(apiResult.response);
                    }
                }
            } else {
                // --- Proactive Presence Change ---
                const statusPrompt = `${config.CORE_SYSTEM_RULE}\n\n[My internal monologue]\nMy name is ${client.user.username}. I'm deciding on a new Discord presence to reflect my mood. I need to output a JSON object with my decision. The JSON should contain 'onlineStatus' (one of: online, idle, dnd), 'activityType' (one of: Playing, Listening, Watching, Competing, Custom), 'activityName' (the text to display), and optionally an 'emoji' for custom statuses. The text must be in ${config.BOT_LANGUAGE}. I will only output the raw JSON object, without any additional text or explanations.\n\nMy JSON response is:`;
                const rawStatusResponse = await callGemini(statusPrompt);
                 if (rawStatusResponse) {
                    try {
                        // Extract only the JSON part from the response
                        const jsonMatch = rawStatusResponse.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) {
                            console.error("[Proactive] No valid JSON object found in the response.", "\nRaw response:", rawStatusResponse);
                            return;
                        }
                        const cleanedResponse = jsonMatch[0];
                        const apiResult = JSON.parse(cleanedResponse);
                        const { onlineStatus, activityType, activityName, emoji } = apiResult;

                        if (onlineStatus && activityType && activityName) {
                            // Sanitize the activityType from the LLM to match the enum key (e.g., "playing" -> "Playing")
                            const formattedActivityType = activityType.charAt(0).toUpperCase() + activityType.slice(1).toLowerCase();
                            const discordActivityType = ActivityType[formattedActivityType];

                            if (discordActivityType !== undefined) {
                                let activity = {};
                                if (discordActivityType === ActivityType.Custom) {
                                    activity = {
                                        name: activityName, // Set both name and state for Custom status
                                        type: ActivityType.Custom,
                                        state: activityName,
                                    };
                                    if (emoji) {
                                        activity.emoji = { name: emoji };
                                    }
                                } else {
                                    activity = {
                                        name: activityName,
                                        type: discordActivityType,
                                    };
                                }

                                console.log(`[Proactive] Changing presence to: ${onlineStatus} | ${formattedActivityType} ${activityName} ${emoji || ''}`);
                                client.user.setPresence({
                                    activities: [activity],
                                    status: onlineStatus,
                                });
                            } else {
                                console.error(`[Proactive] Invalid activityType received from Gemini: ${activityType}`);
                            }
                        }
                    } catch (e) {
                        console.error("[Proactive] Failed to parse status response:", e, "\nRaw response:", rawStatusResponse);
                    }
                }
            }
        } catch (error) {
            console.error('[Proactive] Error during proactive action:', error);
        }
    };

    // Run it once immediately, then set the interval
    performProactiveAction();
    proactiveInterval = setInterval(performProactiveAction, config.PROACTIVE_INTERVAL);
}

module.exports = { startProactiveBehavior };
