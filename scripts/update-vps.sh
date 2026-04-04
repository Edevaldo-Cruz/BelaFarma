#!/bin/bash

# Configurações
PROD_USER="ed"
PROD_IP="192.168.1.10"
REMOTE_DIR="~/projects/BelaFarma"

echo "==============================================="
echo "   ATUALIZANDO VPS - BELAFARMA (COMPLETO)"
echo "==============================================="
echo ""

# 1. Enviar .env
echo "1. Enviando arquivo .env (chave nova)..."
echo "Digite a senha (2494) se solicitado."
scp .env "$PROD_USER@$PROD_IP:$REMOTE_DIR/.env"

if [ $? -ne 0 ]; then
    echo "   ❌ Falha no envio do .env. Verifique a conexão."
    exit 1
fi

# 2. Atualizar e Reconstruir
echo ""
echo "2. Corrigindo permissões e atualizando código via Git..."
echo "Isso pode levar alguns minutos..."
ssh -t "$PROD_USER@$PROD_IP" "cd $REMOTE_DIR && sudo chown -R ed:ed mensagens/ 2>/dev/null || true && git fetch origin && git reset --hard origin/main && docker-compose up -d --build"

if [ $? -eq 0 ]; then
    echo ""
    echo "   ✅ VPS ATUALIZADA E RECONSTRUÍDA COM SUCESSO!"
    echo "   🚀 A Central de IA já deve estar visível."
else
    echo ""
    echo "   ⚠️  Erro durante a atualização. Verifique os logs na VPS."
fi
