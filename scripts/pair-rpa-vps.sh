#!/bin/bash
# =============================================================
#  Script para parear o WhatsApp Web RPA diretamente na VPS
#  Roda FORA do Docker, na máquina host da VPS
# =============================================================

REMOTE_DIR=~/projects/BelaFarma
SESSION_DIR="$REMOTE_DIR/data/whatsapp-session-rpa"
SCREENSHOT="$REMOTE_DIR/data/rpa-pair-screenshot.png"

echo "============================================="
echo "  PAREAMENTO DO RPA - WhatsApp Web (VPS)"
echo "============================================="
echo ""

# 1. Para qualquer processo Chromium travado dentro do Docker
echo "🔧 Passo 1: Matando processos Chromium travados no container..."
docker exec belafarma-backend-1 bash -c "pkill -f chromium || true" 2>/dev/null
echo "   ✅ Processos internos limpos."

# 2. Remove lock files órfãos
echo "🔧 Passo 2: Removendo SingletonLock..."
rm -f "$SESSION_DIR/SingletonLock" 2>/dev/null
rm -f "$SESSION_DIR/SingletonSocket" 2>/dev/null
rm -f "$SESSION_DIR/SingletonCookie" 2>/dev/null
echo "   ✅ Lock files removidos."

# 3. Verifica se chromium está instalado na VPS host
echo "🔧 Passo 3: Verificando Chromium na VPS..."
CHROMIUM_PATH=""
for p in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /snap/bin/chromium; do
    if [ -f "$p" ]; then
        CHROMIUM_PATH="$p"
        break
    fi
done

if [ -z "$CHROMIUM_PATH" ]; then
    echo "   ⚠️ Chromium não encontrado na VPS host. Instalando..."
    sudo apt-get update -qq && sudo apt-get install -y -qq chromium-browser 2>/dev/null || sudo apt-get install -y -qq chromium 2>/dev/null
    for p in /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
        if [ -f "$p" ]; then
            CHROMIUM_PATH="$p"
            break
        fi
    done
fi

if [ -z "$CHROMIUM_PATH" ]; then
    echo "   ❌ Não foi possível instalar o Chromium. Tentando via Node/Puppeteer..."
    
    # Fallback: usar npx puppeteer diretamente  
    cd "$REMOTE_DIR"
    
    # Cria script Node temporário
    cat > /tmp/pair-whatsapp.js << 'NODESCRIPT'
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
    const sessionDir = process.argv[2];
    const screenshotPath = process.argv[3];
    
    console.log('🚀 Iniciando Chromium para pareamento...');
    console.log('📂 Sessão:', sessionDir);
    
    // Limpa locks
    ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].forEach(f => {
        const fp = path.join(sessionDir, f);
        try { fs.unlinkSync(fp); } catch(e) {}
    });
    
    const browser = await puppeteer.launch({
        headless: 'new',
        userDataDir: sessionDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    await new Promise(r => setTimeout(r, 2000));
    const page = await browser.newPage();
    await new Promise(r => setTimeout(r, 1000));
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('📸 Tirando screenshots por 3 minutos...');
    console.log('👉 Acesse: http://192.168.1.70:8085/api/whatsapp/rpa-screenshot');
    
    for (let i = 0; i < 180; i += 5) {
        await page.screenshot({ path: screenshotPath });
        console.log(`📸 Screenshot ${i}s - Atualizado`);
        
        const loggedIn = await page.evaluate(() => {
            return !!document.querySelector('span[data-icon="chat"]') || 
                   !!document.querySelector('span[data-icon="search"]');
        });
        
        if (loggedIn) {
            console.log('✅ CONECTADO! Sessão salva com sucesso!');
            await page.screenshot({ path: screenshotPath });
            await browser.close();
            process.exit(0);
        }
        
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('⏰ Tempo esgotado (3 min).');
    await browser.close();
    process.exit(1);
})();
NODESCRIPT

    echo "   🚀 Executando pareamento via Docker exec (com locks limpos)..."
    docker exec belafarma-backend-1 node /tmp/pair-whatsapp.js "$SESSION_DIR" "$SCREENSHOT"
    exit $?
fi

echo "   ✅ Chromium encontrado: $CHROMIUM_PATH"
echo ""

# 4. Garante que a pasta de sessão existe
mkdir -p "$SESSION_DIR"

# 5. Roda Chromium headless na VPS host
echo "🚀 Passo 4: Abrindo WhatsApp Web na VPS..."
echo "============================================="
echo "👉 Fique atualizando (F5) a tela de screenshot!"
echo "👉 http://192.168.1.70:8085/api/whatsapp/rpa-screenshot"  
echo "============================================="
echo ""

# Usa Node/Puppeteer do container mas com os locks já limpos
# Copia o script para dentro do container e executa
docker exec belafarma-backend-1 bash -c "
    rm -f /usr/src/app/data/whatsapp-session-rpa/SingletonLock
    rm -f /usr/src/app/data/whatsapp-session-rpa/SingletonSocket
    rm -f /usr/src/app/data/whatsapp-session-rpa/SingletonCookie
    echo 'Locks limpos dentro do container'
"

echo "🔄 Agora iniciando a conexão via API..."
curl -s "http://localhost:3001/api/whatsapp/rpa-connect" > /dev/null 2>&1 &

echo ""
echo "⏳ Aguardando 10 segundos para o browser iniciar..."
sleep 10

echo "📸 Verificando screenshot..."
if [ -f "$REMOTE_DIR/backend/rpa-screenshot.png" ]; then
    cp "$REMOTE_DIR/backend/rpa-screenshot.png" "$REMOTE_DIR/data/rpa-pair-screenshot.png"
    echo "✅ Screenshot disponível!"
else
    echo "⚠️ Screenshot ainda não disponível. Continue atualizando a página."
fi

echo ""
echo "============================================="
echo "🔄 Fique atualizando (F5) em:"
echo "   http://192.168.1.70:8085/api/whatsapp/rpa-screenshot"
echo ""
echo "📱 Quando o QR Code aparecer:"
echo "   WhatsApp > Aparelhos Conectados > Conectar"
echo "============================================="
