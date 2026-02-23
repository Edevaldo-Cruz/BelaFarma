#!/bin/bash

# Gerenciador de Backups Remotos - BelaFarma
# Permite listar, baixar e restaurar backups armazenados no servidor VPS

# Configurações
SERVER_USER="ed"
SERVER_IP="192.168.1.10"
SERVER="$SERVER_USER@$SERVER_IP"
REMOTE_BACKUP_DIR="/home/ed/backups/belafarma"
PROD_DB_PATH="/home/ed/projetcs/BelaFarma/backend/belafarma.db"
LOCAL_DB_PATH="./backend/belafarma.db"

# Cores
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           Gerenciador de Backups Remotos (VPS)             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Listar backups disponíveis
echo -e "${YELLOW}Buscando backups disponíveis no servidor...${NC}"
echo ""

# Obtém lista de arquivos ordenados por data (mais recente primeiro)
# Exibe apenas o nome do arquivo, removendo o caminho
BACKUPS=$(ssh "$SERVER" "ls -1t $REMOTE_BACKUP_DIR/*.db 2>/dev/null")

if [ -z "$BACKUPS" ]; then
    echo -e "${RED}Nenhum backup encontrado em $REMOTE_BACKUP_DIR${NC}"
    exit 1
fi

# Array para guardar nomes limpos
declare -a BACKUP_LIST
i=1

# Exibe menu
echo -e "ID  | Data/Hora          | Arquivo"
echo -e "----|--------------------|------------------------"

# Processa e exibe cada backup
while IFS= read -r filepath; do
    filename=$(basename "$filepath")
    # Tenta extrair timestamp do nome (belafarma_YYYY-MM-DD_HH-MM-SS.db)
    timestamp=$(echo "$filename" | sed -n 's/belafarma_\(.*\)\.db/\1/p' | sed 's/_/ /' | sed 's/-/\//g' | sed 's/\//-/3' | sed 's/\//-/3')
    
    printf "%-4s| %-18s | %s\n" "[$i]" "$timestamp" "$filename"
    BACKUP_LIST[$i]="$filepath"
    ((i++))
done <<< "$BACKUPS"

echo ""
echo -e " [N] Criar NOVO Backup Agora"
echo "------------------------------------------------"
read -p "Selecione o número do backup (ou 'N'): " selection

if [[ "$selection" == "n" || "$selection" == "N" ]]; then
    ./scripts/create-remote-backup.sh
    echo ""
    echo -e "${YELLOW}Pressione ENTER para recarregar a lista...${NC}"
    read
    exec "$0" # Reinicia o script
fi

SELECTED_BACKUP="${BACKUP_LIST[$selection]}"

if [ -z "$SELECTED_BACKUP" ]; then
    echo -e "${RED}Opção inválida.${NC}"
    exit 1
fi

SELECTED_FILENAME=$(basename "$SELECTED_BACKUP")
echo ""
echo -e "${GREEN}Backup selecionado: ${NC}$SELECTED_FILENAME"
echo "------------------------------------------------"
echo -e " [1] Restaurar no ${CYAN}AMBIENTE LOCAL${NC} (Desenvolvimento)"
echo -e " [2] Restaurar no ${RED}SERVIDOR DE PRODUÇÃO${NC} (Rollback/Perigo ⚠)"
echo -e " [0] Cancelar"
echo "------------------------------------------------"
read -p "Escolha uma ação: " action

case "$action" in
    1)
        echo ""
        echo -e "${YELLOW}Restaurando para o ambiente local...${NC}"
        
        # Backup do local atual
        cp "$LOCAL_DB_PATH" "${LOCAL_DB_PATH}.temp_backup" 2>/dev/null
        
        echo -e "Baixando arquivo..."
        scp "$SERVER:$SELECTED_BACKUP" "$LOCAL_DB_PATH"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Sucesso! O banco local foi substituído pelo backup histórico.${NC}"
            echo -e "Reinicie o backend local para ver as alterações."
        else
            echo -e "${RED}Erro ao baixar arquivo.${NC}"
            # Restaura backup local se falhou
            mv "${LOCAL_DB_PATH}.temp_backup" "$LOCAL_DB_PATH" 2>/dev/null
        fi
        ;;
        
    2)
        echo ""
        echo -e "${RED}⚠ CUIDADO ⚠${NC}"
        echo -e "Você está prestes a substituir o banco de dados de ${RED}PRODUÇÃO${NC}."
        echo -e "Isso fará o sistema voltar no tempo para o estado do backup."
        echo -e "Dados criados após esse backup serão perdidos (mas faremos um backup de segurança do estado atual antes)."
        echo ""
        read -p "Digite 'CONFIRMAR' para continuar: " confirm
        
        if [ "$confirm" == "CONFIRMAR" ]; then
            echo ""
            echo -e "${YELLOW}Iniciando rollback em produção...${NC}"
            
            # Comando remoto complexo
            ssh "$SERVER" "
                # 1. Backup de segurança do atual (Rescue Backup)
                echo 'Criando backup de segurança do estado atual...'
                cp '$PROD_DB_PATH' '$REMOTE_BACKUP_DIR/rescue_backup_before_rollback_$(date +%s).db'
                
                # 2. Substituir o banco
                echo 'Aplicando backup antigo...'
                cp '$SELECTED_BACKUP' '$PROD_DB_PATH'
                
                # 3. Ajustar permissões (caso necessário)
                # chmod 644 '$PROD_DB_PATH'
                
                echo '✓ Rollback concluído.'
            "
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Restaurado com sucesso no servidor!${NC}"
                echo -e "Recomenda-se reiniciar o servidor ou o serviço backend."
                read -p "Deseja reiniciar o VPS agora? (s/n): " reboot_opt
                if [[ "$reboot_opt" == "s" ]]; then
                    ./scripts/reboot-vps.sh
                fi
            else
                echo -e "${RED}Erro ao executar rollback no servidor.${NC}"
            fi
        else
            echo -e "${RED}Operação cancelada.${NC}"
        fi
        ;;
        
    *)
        echo "Cancelado."
        exit 0
        ;;
esac
