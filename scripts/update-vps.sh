#!/bin/bash

# Configurações
PROD_USER="ed"
PROD_IP="192.168.1.70"
REMOTE_DIR="~/projects/BelaFarma"

echo "======================================================="
echo "   🚀 DEPLOY HARD & LIMPO - BELAFARMA (RASPBERRY PI)"
echo "======================================================="
echo ""

# 1. Commit e Push Local
echo "[1/4] Realizando commit e push local..."
git add .
git commit -m "feat: modulo bloco de notas e deploy hard limpo" || true
git push origin main

# 2. Enviar .env
echo ""
echo "[2/4] Enviando arquivo .env (configurações)..."
scp .env "$PROD_USER@$PROD_IP:$REMOTE_DIR/.env"

if [ $? -ne 0 ]; then
    echo "   ⚠️  Aviso: Não foi possível enviar o .env diretamente (verifique conexão ou continue)."
fi

# 3. Atualizar, Limpar e Reconstruir na VPS
echo ""
echo "[3/4] Executando Hard Clean e Rebuild na VPS ($PROD_IP)..."
ssh -t "$PROD_USER@$PROD_IP" "cd $REMOTE_DIR && git fetch origin && git reset --hard origin/main && docker-compose down --remove-orphans && docker image prune -f && docker-compose build --no-cache && docker-compose up -d && docker-compose ps"

if [ $? -eq 0 ]; then
    echo ""
    echo "   ✅ DEPLOY HARD CONCLUÍDO COM SUCESSO!"
    echo "   🌐 Servidor ativo em http://192.168.1.70"
else
    echo ""
    echo "   ⚠️  Erro durante o deploy. Verifique os logs na VPS."
fi

