#!/bin/bash

# Script para restaurar o banco de dados de produção no ambiente de desenvolvimento
# Autor: Gerado automaticamente
# Data: 2026-01-30

set -e  # Sai se houver erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
PROD_SERVER="ed@192.168.1.9"
PROD_DB_PATH="/home/ed/projetcs/BelaFarma/backend/belafarma.db"
LOCAL_BACKEND_DIR="./backend"
LOCAL_DB_FILE="$LOCAL_BACKEND_DIR/belafarma.db"
TEMP_DB_FILE="$LOCAL_BACKEND_DIR/banco-producao.db"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$LOCAL_DB_FILE.backup.$TIMESTAMP"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Restauração do Banco de Dados de Produção - BelaFarma   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Função para restaurar backup
restore_backup() {
    local backup_to_restore=$1
    if [ -f "$backup_to_restore" ]; then
        echo -e "${YELLOW}Restaurando backup: $backup_to_restore${NC}"
        cp "$backup_to_restore" "$LOCAL_DB_FILE"
        echo -e "${GREEN}✓ Backup restaurado com sucesso!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Arquivo de backup não encontrado: $backup_to_restore${NC}"
        exit 1
    fi
}

# Verificar se é para restaurar um backup
if [ "$1" == "--restore-backup" ] && [ -n "$2" ]; then
    restore_backup "$2"
fi

# Listar backups disponíveis
if [ "$1" == "--list-backups" ]; then
    echo -e "${BLUE}Backups disponíveis:${NC}"
    ls -lh "$LOCAL_BACKEND_DIR"/*.backup.* 2>/dev/null || echo "Nenhum backup encontrado"
    exit 0
fi

# Verificar se o diretório backend existe
if [ ! -d "$LOCAL_BACKEND_DIR" ]; then
    echo -e "${RED}✗ Diretório backend não encontrado: $LOCAL_BACKEND_DIR${NC}"
    exit 1
fi

# Passo 1: Backup do banco atual
echo -e "${YELLOW}[1/5] Criando backup do banco de dados atual...${NC}"
if [ -f "$LOCAL_DB_FILE" ]; then
    cp "$LOCAL_DB_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup criado: $BACKUP_FILE${NC}"
    BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    echo -e "  Tamanho: $BACKUP_SIZE"
else
    echo -e "${YELLOW}⚠ Arquivo de banco local não encontrado. Pulando backup.${NC}"
fi
echo ""

# Passo 2: Download do banco de produção
echo -e "${YELLOW}[2/5] Baixando banco de dados de produção...${NC}"
echo -e "  Servidor: ${BLUE}$PROD_SERVER${NC}"
echo -e "  Arquivo: ${BLUE}$PROD_DB_PATH${NC}"
echo ""
echo -e "${YELLOW}Digite a senha quando solicitado...${NC}"

if scp "$PROD_SERVER:$PROD_DB_PATH" "$TEMP_DB_FILE"; then
    echo -e "${GREEN}✓ Download concluído com sucesso!${NC}"
    PROD_SIZE=$(ls -lh "$TEMP_DB_FILE" | awk '{print $5}')
    echo -e "  Tamanho: $PROD_SIZE"
else
    echo -e "${RED}✗ Erro ao baixar o banco de dados de produção${NC}"
    echo -e "${YELLOW}Restaurando backup...${NC}"
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$LOCAL_DB_FILE"
        echo -e "${GREEN}✓ Backup restaurado${NC}"
    fi
    exit 1
fi
echo ""

# Passo 3: Verificar integridade do arquivo baixado
echo -e "${YELLOW}[3/5] Verificando integridade do arquivo...${NC}"
if [ ! -s "$TEMP_DB_FILE" ]; then
    echo -e "${RED}✗ Arquivo baixado está vazio ou corrompido${NC}"
    rm -f "$TEMP_DB_FILE"
    exit 1
fi
echo -e "${GREEN}✓ Arquivo válido${NC}"
echo ""

# Passo 4: Substituir banco local
echo -e "${YELLOW}[4/5] Substituindo banco de dados local...${NC}"
cp "$TEMP_DB_FILE" "$LOCAL_DB_FILE"
echo -e "${GREEN}✓ Banco de dados substituído com sucesso!${NC}"
echo ""

# Passo 5: Limpeza
echo -e "${YELLOW}[5/5] Limpando arquivos temporários...${NC}"
rm -f "$TEMP_DB_FILE"
echo -e "${GREEN}✓ Limpeza concluída${NC}"
echo ""

# Resumo
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Restauração Concluída com Sucesso!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Informações:${NC}"
echo -e "  • Backup criado em: ${YELLOW}$BACKUP_FILE${NC}"
if [ -n "$BACKUP_SIZE" ]; then
    echo -e "  • Tamanho do backup: $BACKUP_SIZE"
fi
echo -e "  • Tamanho do banco de produção: $PROD_SIZE"
echo ""
echo -e "${YELLOW}⚠ IMPORTANTE:${NC}"
echo -e "  ${RED}1.${NC} Reinicie o servidor backend para aplicar as mudanças:"
echo -e "     ${BLUE}cd backend && npm run dev${NC}"
echo ""
echo -e "  ${RED}2.${NC} Limpe o cache do navegador:"
echo -e "     ${BLUE}F12 > Botão direito no refresh > Limpar cache e recarregar${NC}"
echo ""
echo -e "${BLUE}Para restaurar um backup:${NC}"
echo -e "  ${BLUE}./scripts/restore-production-db.sh --restore-backup $BACKUP_FILE${NC}"
echo ""
echo -e "${BLUE}Para listar backups disponíveis:${NC}"
echo -e "  ${BLUE}./scripts/restore-production-db.sh --list-backups${NC}"
echo ""
