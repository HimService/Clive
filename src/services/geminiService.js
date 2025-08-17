const axios = require('axios');
const config = require('../config');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(prompt, { image, audio } = {}, retries = 3, delay = 1000) {
    const parts = [{ text: prompt }];
    if (image && image.data && image.mime_type) {
        parts.push({
            inline_data: {
                mime_type: image.mime_type,
                data: image.data,
            },
        });
    }
    if (audio && audio.data && audio.mime_type) {
        parts.push({
            inline_data: {
                mime_type: audio.mime_type,
                data: audio.data,
            },
        });
    }

    const payload = {
        contents: [{ parts }],
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    };

    const apiUrl = (image || audio)
        ? config.GEMINI_API_URL.replace('gemini-2.5-pro', 'gemini-2.5-flash')
        : config.GEMINI_API_URL;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.post(
                `${apiUrl}?key=${config.GEMINI_API_KEY}`,
                payload,
                { headers: { 'Content-Type': 'application/json' } }
            );
            return response.data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || null;
        } catch (error) {
            const status = error.response ? error.response.status : null;
            const errorData = error.response ? error.response.data : error.message;

            if (status === 429 && i < retries - 1) {
                console.warn(`Gemini API rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
                await sleep(delay);
                delay *= 2;
            } else {
                console.error('Error calling Gemini API:', errorData);
                return null;
            }
        }
    }
    return null;
}

module.exports = { callGemini };
