const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const nodeFetch = require('node-fetch');

async function checkKey() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = 'gemini-flash-latest'; // Matching the service
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await nodeFetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'hi' }] }]
            })
        });

        if (response.ok) {
            console.log('API Key Status: OK');
        } else {
            console.log(`API Key Status: FAILED (${response.status})`);
            const text = await response.text();
            console.log(text);
        }
    } catch (e) {
        console.log('API Key Status: ERROR');
        console.log(e.message);
    }
}
checkKey();
