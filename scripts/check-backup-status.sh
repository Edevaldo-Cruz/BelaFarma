#!/bin/bash

# Script para verificar status do agendamento e hora do servidor
# Ajuda a garantir que os backups rodarão na hora certa

SERVER="ed@192.168.1.10"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Conectando ao servidor para diagnóstico...${NC}"
echo ""

ssh -t "$SERVER" "
    echo -e '${YELLOW}1. Horário Atual do Servidor:${NC}'
    date
    echo ''
    
    echo -e '${YELLOW}2. Status do Serviço de Agendamento (Cron):${NC}'
    if systemctl is-active --quiet cron; then
        echo -e '${GREEN}● O serviço Cron está RODANDO.${NC}'
    else
        echo -e '\033[0;31m⚠ O serviço Cron está PARADO.\033[0m'
    fi
    echo ''
    
    echo -e '${YELLOW}3. Tarefas Agendadas (Crontab):${NC}'
    crontab -l | grep 'auto_backup.sh'
    if [ \$? -eq 0 ]; then
        echo -e '${GREEN}✓ O script de backup está devidamente agendado.${NC}'
    else
        echo -e '\033[0;31m⚠ NENHUM agendamento de backup encontrado!${NC}'
    fi
"

echo ""
echo -e "${BLUE}Dica:${NC} Se o horário do servidor estiver diferente do seu,"
echo "os backups acontecerão no horário do servidor, não no seu relógio."
