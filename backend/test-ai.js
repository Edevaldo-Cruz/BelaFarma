const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const { callAI } = require('./services/ai.service');

async function test() {
  try {
    console.log('Testing OpenAI with callAI...');
    console.log('AI_PROVIDER:', process.env.AI_PROVIDER);
    console.log('GPT_MODEL:', process.env.GPT_MODEL);
    const key = process.env.OPENAI_API_KEY || '';
    console.log('Using Key:', key.substring(0, 15) + '...');
    const result = await callAI('Olá, diga oi.', 'Você é um assistente útil.');
    console.log('Result:', result);
  } catch (err) {
    console.error('Error in test:', err);
  }
}

test();
