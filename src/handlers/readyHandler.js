const { loadFavorability } = require('../systems/favorabilitySystem');
const { startProactiveBehavior } = require('../systems/proactiveSystem');
const { loadMemories } = require('../systems/memorySystem');

function onReady(client) {
    console.log(`Logged in as ${client.user.tag}!`);
    loadFavorability();
    loadMemories();
    startProactiveBehavior(client);
}

module.exports = { onReady };
