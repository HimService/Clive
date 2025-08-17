const fs = require('fs');

const MEMORY_FILE = 'memories.json';
let memories = {};

function loadMemories() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8');
            memories = JSON.parse(data);
            console.log('Memory data loaded successfully.');
        } else {
            console.log('No memory file found, starting fresh.');
        }
    } catch (err) {
        console.error(`Could not load ${MEMORY_FILE}, starting fresh.`, err);
        memories = {};
    }
}

function saveMemories() {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
    } catch (err) {
        console.error('Failed to save memory file:', err);
    }
}

function getMemories(userId) {
    return memories[userId] || [];
}

function addMemory(userId, memory) {
    if (!memories[userId]) {
        memories[userId] = [];
    }
    // Add the new memory and keep only the most recent ones (e.g., last 10)
    memories[userId].push(memory);
    memories[userId] = memories[userId].slice(-10);
    saveMemories();
}

function resetMemories() {
    memories = {};
    saveMemories();
    console.log('!!! All memories have been reset.');
}

module.exports = {
    loadMemories,
    getMemories,
    addMemory,
    resetMemories,
};
