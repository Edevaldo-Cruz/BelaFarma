#!/bin/bash

# Script para sincronizar backups com o Google Drive
# Deve ser agendado no crontab
# Autor: Antigravity Agent

# Configurações
LOCAL_BACKUP_DIR="/home/ed/projects/BelaFarma/data/backups"
REMOTE_NAME="gdrive" # Nome que você deu no 'rclone config'
REMOTE_FOLDER="Backups_BelaFarma" # Pasta no Google Drive

# Garante que o diretório existe
mkdir -p $LOCAL_BACKUP_DIR

# Sincroniza (envia arquivos novos para nuvem)
# --ignore-existing: Não envia se já existe (economiza banda)
# --progress: Mostra progresso (útil se rodar manual)
rclone copy "$LOCAL_BACKUP_DIR" "$REMOTE_NAME:$REMOTE_FOLDER" --ignore-existing

# Log simples (opcional)
echo "$(date): Backup enviado para Google Drive" >> /home/ed/cron_backup.log
