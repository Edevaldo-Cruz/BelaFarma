#!/bin/bash

# Script para forçar a criação de um backup no servidor VPS imediatamente
# Autor: Agente AI
# Data: 2026-01-31

SERVER_USER="ed"
SERVER_IP="192.168.1.9"
SERVER="$SERVER_USER@$SERVER_IP"
REMOTE_SCRIPT_PATH="/home/ed/scripts/auto_backup.sh"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Criação Manual de Backup Remoto (VPS)             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Conectando ao servidor $SERVER...${NC}"

# Verifica se o script remoto existe
ssh "$SERVER" "[ -f $REMOTE_SCRIPT_PATH ]"
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro: Script de backup não encontrado no servidor em $REMOTE_SCRIPT_PATH${NC}"
    echo -e "Execute './scripts/setup-auto-backup.sh' primeiro para configurar o ambiente."
    exit 1
fi

echo -e "${YELLOW}Executando backup...${NC}"
echo ""

# Executa o script e captura a saída
ssh "$SERVER" "$REMOTE_SCRIPT_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Backup manual concluído com sucesso!${NC}"
    
    # Mostra o nome do arquivo gerado (pega o mais recente)
    LATEST_BACKUP=$(ssh "$SERVER" "ls -t /home/ed/backups/belafarma/*.db | head -1")
    filename=$(basename "$LATEST_BACKUP")
    size=$(ssh "$SERVER" "du -h $LATEST_BACKUP | cut -f1")
    
    echo -e "Arquivo criado: ${BLUE}$filename${NC} ($size)"
else
    echo -e "${RED}❌ Ocorreu um erro ao criar o backup.${NC}"
    exit 1
fi
