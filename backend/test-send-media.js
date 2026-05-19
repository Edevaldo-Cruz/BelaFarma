const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration variables
const API_URL = (process.env.EVOLUTION_API_URL || 'http://evolution-api:8080').replace('evolution-api', 'localhost');
const SENDER_KEY = process.env.EVOLUTION_SENDER_API_KEY || process.env.EVOLUTION_API_KEY || 'BelaAtende2026';
const SENDER_INSTANCE = process.env.EVOLUTION_SENDER_INSTANCE || 'belaAtende';
const MAIN_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const MAIN_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'belaFarma';

const ADMIN_PHONES = (process.env.ADMIN_WHATSAPP || '').split(',').map(p => p.trim()).filter(p => !!p);
const testPhone = ADMIN_PHONES[0] || '5532988634755';

console.log('=== TESTE DE DIAGNÓSTICO: ENVIO DE IMAGEM COM LEGENDA (EVOLUTION API) ===');
console.log(`URL da API (host): ${API_URL}`);
console.log(`Instância de Envio (belaAtende): ${SENDER_INSTANCE}`);
console.log(`Instância Principal (belaFarma): ${MAIN_INSTANCE}`);
console.log(`Número de Teste: ${testPhone}`);
console.log('========================================================================\n');

// 1x1 transparent PNG pixel base64
const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function checkConnection(instanceName, apiKey) {
  const url = `${API_URL}/instance/connectionState/${instanceName}`;
  try {
    const res = await fetch(url, { headers: { 'apikey': apiKey } });
    if (!res.ok) {
      return { success: false, status: res.status, error: `Erro HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function trySendPayload(instanceName, apiKey, payloadName, payload) {
  const url = `${API_URL}/message/sendMedia/${instanceName}`;
  console.log(`\n📤 Testando payload [${payloadName}] na instância [${instanceName}]...`);
  console.log(`Payload enviado:\n`, JSON.stringify(payload, (key, value) => {
    if (key === 'media' && typeof value === 'string' && value.length > 100) {
      return value.substring(0, 50) + '... [CORTADO BASE64] ...' + value.substring(value.length - 20);
    }
    return value;
  }, 2));

  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload)
    });
    const duration = Date.now() - start;
    console.log(`Status HTTP: ${res.status} (em ${duration}ms)`);
    
    let result = {};
    try {
      result = await res.json();
    } catch (e) {
      const text = await res.text();
      console.log(`Resposta (Texto puro): ${text}`);
      return { success: false, error: 'Resposta não é JSON', text };
    }

    console.log(`Resposta JSON:\n`, JSON.stringify(result, null, 2));

    if (res.ok) {
      console.log(`✅ Payload [${payloadName}] enviado com sucesso! ID: ${result.key?.id || 'desconhecido'}`);
      return { success: true, result };
    } else {
      console.error(`❌ Falha ao enviar Payload [${payloadName}]:`, result.message || 'Sem mensagem de erro');
      return { success: false, result };
    }
  } catch (err) {
    console.error(`💥 Erro de rede no Payload [${payloadName}]:`, err.message);
    return { success: false, error: err.message };
  }
}

async function runDiagnostics() {
  // 1. Verificar conexão das instâncias
  console.log('🔍 1. Verificando estado das instâncias...');
  
  const senderConn = await checkConnection(SENDER_INSTANCE, SENDER_KEY);
  console.log(`Estado da instância [${SENDER_INSTANCE}]:`, senderConn.success ? senderConn.data.instance.state : `Falha ao consultar: ${senderConn.error}`);
  
  const mainConn = await checkConnection(MAIN_INSTANCE, MAIN_KEY);
  console.log(`Estado da instância [${MAIN_INSTANCE}]:`, mainConn.success ? mainConn.data.instance.state : `Falha ao consultar: ${mainConn.error}`);

  // Escolhe a instância ativa para o teste
  let activeInstance = null;
  let activeKey = null;

  if (senderConn.success && senderConn.data.instance.state === 'open') {
    activeInstance = SENDER_INSTANCE;
    activeKey = SENDER_KEY;
  } else if (mainConn.success && mainConn.data.instance.state === 'open') {
    activeInstance = MAIN_INSTANCE;
    activeKey = MAIN_KEY;
  } else {
    console.warn('\n⚠️ Nenhuma das instâncias está marcada como OPEN. Tentando com belaAtende mesmo assim...');
    activeInstance = SENDER_INSTANCE;
    activeKey = SENDER_KEY;
  }

  console.log(`\n🎯 Usando a instância [${activeInstance}] para os testes de envio.\n`);

  // Limpa o telefone
  const cleanPhone = testPhone.replace(/\D/g, '');

  // DEFINIÇÃO DOS PAYLOADS
  
  // 1. Payload Atual (Aninhado em mediaMessage, sem mimetype)
  const payload1 = {
    number: cleanPhone,
    mediaMessage: {
      mediatype: "image",
      caption: "Teste Payload 1: Aninhado (Estilo Atual)",
      media: testBase64
    },
    options: {
      delay: 1000,
      presence: "composing"
    }
  };

  // 2. Payload Aninhado com mimetype e fileName explicitados
  const payload2 = {
    number: cleanPhone,
    mediaMessage: {
      mediatype: "image",
      mimetype: "image/png",
      fileName: "teste.png",
      caption: "Teste Payload 2: Aninhado + Mimetype + FileName",
      media: testBase64
    },
    options: {
      delay: 1000,
      presence: "composing"
    }
  };

  // 3. Payload FLAT (Direto na raiz, sem mediaMessage) - Muito comum nas v1/v2 mais recentes
  const payload3 = {
    number: cleanPhone,
    mediatype: "image",
    mimetype: "image/png",
    caption: "Teste Payload 3: Estrutura FLAT",
    media: testBase64,
    fileName: "teste.png",
    options: {
      delay: 1000,
      presence: "composing"
    }
  };

  // 4. Payload FLAT sem prefixo data:image no Base64 (somente a hash raw)
  const rawBase64 = testBase64.split(',')[1];
  const payload4 = {
    number: cleanPhone,
    mediatype: "image",
    mimetype: "image/png",
    caption: "Teste Payload 4: FLAT + Raw Base64 (Sem Prefixo)",
    media: rawBase64,
    fileName: "teste.png"
  };

  // Executa os testes
  const results = [];
  
  results.push(await trySendPayload(activeInstance, activeKey, '1. Atual (Aninhado, Sem Mimetype)', payload1));
  await new Promise(r => setTimeout(r, 2000));
  
  results.push(await trySendPayload(activeInstance, activeKey, '2. Aninhado + Mimetype + FileName', payload2));
  await new Promise(r => setTimeout(r, 2000));
  
  results.push(await trySendPayload(activeInstance, activeKey, '3. Estrutura FLAT', payload3));
  await new Promise(r => setTimeout(r, 2000));
  
  results.push(await trySendPayload(activeInstance, activeKey, '4. FLAT + Raw Base64 (Sem Prefixo)', payload4));

  console.log('\n================ RESUMO DOS TESTES ================');
  results.forEach((r, idx) => {
    const names = [
      '1. Atual (Aninhado, Sem Mimetype)',
      '2. Aninhado + Mimetype + FileName',
      '3. Estrutura FLAT',
      '4. FLAT + Raw Base64 (Sem Prefixo)'
    ];
    console.log(`${names[idx]}: ${r.success ? '✅ SUCESSO' : '❌ FALHA'}`);
  });
  console.log('===================================================');
}

runDiagnostics().catch(console.error);
