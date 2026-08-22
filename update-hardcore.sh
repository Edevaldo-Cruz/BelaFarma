#!/bin/bash
set -e

echo "====================================================="
echo " ⚡ ATUALIZAÇÃO RÁPIDA & FORÇADA (BelaFarma VPS) ⚡"
echo "====================================================="

cd /home/ed/projects/BelaFarma

echo "1. Sincronizando código com a branch main do GitHub..."
git fetch origin main
git reset --hard origin/main

echo "2. Parando containers anteriores..."
sudo docker-compose down --remove-orphans

echo "3. Recompilando containers (Frontend + Backend)..."
sudo docker-compose build

echo "4. Iniciando novos containers..."
sudo docker-compose up -d --force-recreate

echo "5. Limpeza de imagens antigas..."
sudo docker image prune -f > /dev/null 2>&1 || true

echo "====================================================="
echo " ✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO! (Containers UP)"
echo "====================================================="
sudo docker-compose ps
