const config = require('../config');
const favorabilitySystem = require('../systems/favorabilitySystem');
const memorySystem = require('../systems/memorySystem');

async function handleAdminCommand(message, client) {
    if (message.author.id !== config.OWNER_ID) {
        return message.reply('You do not have permission to use this command.');
    }

    const [command, ...args] = message.content.slice(1).trim().split(/ +/);

    switch (command) {
        case 'reset':
            if (args[0] === 'favorability') {
                favorabilitySystem.resetFavorability();
                console.log(`!!! Favorability has been reset by owner ${message.author.username}.`);
                return message.reply('Long-term memory (favorability) has been cleared.');
            }
            if (args[0] === 'all') {
                favorabilitySystem.resetFavorability();
                memorySystem.resetMemories();
                console.log(`!!! All memories and favorability have been reset by owner ${message.author.username}.`);
                return message.reply('All long-term memory (favorability and shared experiences) has been cleared. My personality will be a blank slate on my next interaction with each user.');
            }
            return message.reply('Invalid reset target. Use `!reset favorability` or `!reset all`.');

        case 'setfavor':
            const userArg = args[0];
            const scoreArg = args[1];

            if (!userArg || !scoreArg) {
                return message.reply('Usage: `!setfavor <@user|userID> <score>`');
            }

            const newScore = parseFloat(scoreArg);
            if (isNaN(newScore)) {
                return message.reply('The score must be a number.');
            }

            let targetUserId;
            const mentionMatch = userArg.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
                targetUserId = mentionMatch[1];
            } else if (/^\d+$/.test(userArg)) {
                targetUserId = userArg;
            } else {
                return message.reply('Invalid user. Please provide a user mention or a user ID.');
            }
            
            const targetUser = await client.users.fetch(targetUserId).catch(() => null);
            if (!targetUser) {
                return message.reply('Could not find that user.');
            }

            favorabilitySystem.setFavorability(targetUserId, newScore);
            console.log(`!!! Favorability for ${targetUser.username} (${targetUserId}) set to ${newScore} by owner ${message.author.username}.`);
            return message.reply(`Favorability for ${targetUser.username} has been set to ${newScore}.`);

        default:
            // Optional: Reply for unknown commands
            // return message.reply('Unknown command.');
            return;
    }
}

module.exports = { handleAdminCommand };
