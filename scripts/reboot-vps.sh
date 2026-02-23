#!/bin/bash

# Script para reiniciar o servidor VPS de produção
# Autor: Agente AI
# Data: 2026-01-31

# Configurações
PROD_SERVER="ed@192.168.1.10"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            Reiniciar VPS de Produção (Reboot)              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠ ATENÇÃO: Isso irá reiniciar completamente o servidor $PROD_SERVER${NC}"
echo -e "${YELLOW}Todos os serviços ficarão indisponíveis por alguns instantes.${NC}"
echo ""
read -p "Tem certeza que deseja continuar? (s/N): " confirm

if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
    echo -e "${RED}Operação cancelada.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Conectando ao servidor...${NC}"
echo -e "Digite a senha do usuário 'ed' (2494) se solicitado."
echo ""

# Executa o comando de reboot
ssh -t "$PROD_SERVER" "echo 'Iniciando reboot...' && sudo reboot"

# O ssh vai desconectar imediatamente após o reboot, o que pode gerar um erro de conexão fechada.
# Isso é esperado.
if [ $? -eq 255 ] || [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Comando de reboot enviado com sucesso!${NC}"
    echo -e "O servidor deve voltar em 1-2 minutos."
else
    echo -e "${RED}✗ Erro ao tentar reiniciar o servidor.${NC}"
fi
