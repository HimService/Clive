const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { onReady } = require('./handlers/readyHandler');
const { onMessageCreate } = require('./handlers/messageCreateHandler');
const { onMessageReactionAdd } = require('./handlers/messageReactionAddHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once('ready', () => onReady(client));
client.on('messageCreate', (message) => onMessageCreate(message, client));
client.on('messageReactionAdd', (reaction, user) => onMessageReactionAdd(reaction, user));

client.login(config.DISCORD_BOT_TOKEN);

console.log('Bot is starting...');
