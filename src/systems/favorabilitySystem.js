const fs = require('fs');
const config = require('../config');

let favorability = {};

function loadFavorability() {
    try {
        if (fs.existsSync(config.FAVORABILITY_FILE)) {
            const data = fs.readFileSync(config.FAVORABILITY_FILE, 'utf8');
            favorability = JSON.parse(data);
            console.log('Favorability data loaded successfully.');
        } else {
            console.log('No favorability file found, starting fresh.');
        }
    } catch (err) {
        console.error(`Could not load ${config.FAVORABILITY_FILE}, starting fresh.`, err);
        favorability = {};
    }
}

function saveFavorability() {
    try {
        fs.writeFileSync(config.FAVORABILITY_FILE, JSON.stringify(favorability, null, 2));
    } catch (err) {
        console.error('Failed to save favorability file:', err);
    }
}

function getFavorability(userId) {
    return favorability[userId] || 0;
}

function updateFavorability(userId, change) {
    if (typeof change !== 'number' || isNaN(change)) return;
    const currentScore = getFavorability(userId);
    favorability[userId] = currentScore + change;
    saveFavorability();
}

function resetFavorability() {
    favorability = {};
    saveFavorability();
    console.log(`!!! Favorability has been reset.`);
}

module.exports = {
    loadFavorability,
    getFavorability,
    updateFavorability,
    resetFavorability,
    setFavorability: (userId, score) => {
        favorability[userId] = score;
        saveFavorability();
    }
};
