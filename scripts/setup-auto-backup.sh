#!/bin/bash

# Script para configurar backup automático no servidor de produção
# Autor: Agente AI
# Data: 2026-01-31

SERVER_USER="ed"
SERVER_IP="192.168.1.9"
SERVER="$SERVER_USER@$SERVER_IP"
REMOTE_SCRIPT_DIR="/home/ed/scripts"
REMOTE_SCRIPT_PATH="$REMOTE_SCRIPT_DIR/auto_backup.sh"
LOCAL_TEMPLATE="scripts/server-backup-template.sh"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Configurando Backup Automático no Servidor $SERVER${NC}"

# 1. Criar diretório de scripts remoto
echo -e "${YELLOW}[1/3] Criando diretório de scripts remoto...${NC}"
ssh "$SERVER" "mkdir -p $REMOTE_SCRIPT_DIR"

# 2. Enviar script de backup
echo -e "${YELLOW}[2/3] Enviando script de backup...${NC}"
scp "$LOCAL_TEMPLATE" "$SERVER:$REMOTE_SCRIPT_PATH"
ssh "$SERVER" "chmod +x $REMOTE_SCRIPT_PATH"
echo -e "${GREEN}Script enviado e permissões ajustadas.${NC}"

# 3. Configurar Cron Jobs
echo -e "${YELLOW}[3/3] Configurando agendamento (Cron)...${NC}"

# Comandos para verificar e adicionar ao crontab
# Executa as 12:00 e 23:00 todos os dias
CRON_CMD_1="0 12 * * * $REMOTE_SCRIPT_PATH"
CRON_CMD_2="0 23 * * * $REMOTE_SCRIPT_PATH"

ssh "$SERVER" "
    # Backup do crontab atual
    crontab -l > mycron.backup 2>/dev/null || touch mycron.backup
    
    # Verifica se já existe para não duplicar
    if grep -Fq '$REMOTE_SCRIPT_PATH' mycron.backup; then
        echo 'Agendamento já existe. Nenhuma alteração feita no Crontab.'
    else
        echo '$CRON_CMD_1' >> mycron.backup
        echo '$CRON_CMD_2' >> mycron.backup
        crontab mycron.backup
        echo 'Novos agendamentos adicionados com sucesso.'
    fi
    rm mycron.backup
"

echo -e "${GREEN}✅ Configuração concluída!${NC}"
echo -e "Backups serão realizados diariamente às 12:00 e 23:00."
echo -e "Os arquivos ficarão em: /home/ed/backups/belafarma"
