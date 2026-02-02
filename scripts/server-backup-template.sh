#!/bin/bash

# Script de Backup Automático - BelaFarma
# Executado via Cron no servidor VPS

# Configurações
BACKUP_DIR="/home/ed/backups/belafarma"
DB_FILE="/home/ed/projetcs/BelaFarma/backend/belafarma.db"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/belafarma_$TIMESTAMP.db"
LOG_FILE="$BACKUP_DIR/backup.log"

# Garantir que o diretório existe
mkdir -p "$BACKUP_DIR"

# Função de log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Iniciando backup..."

# Verificar se o arquivo de banco existe
if [ -f "$DB_FILE" ]; then
    # Realizar cópia usando sqlite3 .backup se possível para integridade, 
    # ou cp simples se sqlite3 não estiver instalado (mas cp pode copiar banco travado/corrompido se estiver em escrita pesada).
    # Vamos usar cp simples por enquanto, pois é mais garantido de funcionar sem dependencias extras, 
    # mas o ideal seria 'sqlite3 source.db ".backup target.db"'
    
    # Tentativa com sqlite3 (mais seguro para hot backup)
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
        EXIT_CODE=$?
    else
        cp "$DB_FILE" "$BACKUP_FILE"
        EXIT_CODE=$?
    fi

    if [ $EXIT_CODE -eq 0 ]; then
        SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
        log "Backup criado com sucesso: $BACKUP_FILE ($SIZE)"
        
        # Limpeza de backups antigos (manter últimos 30 dias)
        find "$BACKUP_DIR" -name "belafarma_*.db" -mtime +30 -delete
        log "Limpeza de backups antigos (>30 dias) realizada."
    else
        log "ERRO: Falha ao criar backup. Código de saída: $EXIT_CODE"
    fi
else
    log "ERRO: Arquivo de banco de dados não encontrado em $DB_FILE"
fi

log "Fim da execução."
