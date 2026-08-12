const { callAI } = require('./services/ai.service');

async function run() {
  try {
    console.log('Testing callAI...');
    const result = await callAI('Hello', 'System prompt', { temperature: 0.0 });
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
