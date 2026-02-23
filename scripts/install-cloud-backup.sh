#!/bin/bash

# Script para instalar Rclone na VPS e preparar estrutura
# Autor: Antigravity Agent

PROD_USER="ed"
PROD_IP="192.168.1.10"

echo "Conectando à VPS para instalar o Rclone..."
ssh -t "$PROD_USER@$PROD_IP" "sudo -v && curl https://rclone.org/install.sh | sudo bash"

echo ""
echo "Rclone instalado!"
echo "Agora você precisa configurar o acesso ao Google Drive."
echo "Rode o comando abaixo manualmente no terminal da VPS:"
echo "rclone config"
