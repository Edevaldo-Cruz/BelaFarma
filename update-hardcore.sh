#!/bin/bash
set -e

echo "====================================================="
echo " 🔥 INICIANDO ATUALIZAÇÃO HARDCORE (BelaFarma VPS) 🔥"
echo "====================================================="

cd /home/ed/projects/BelaFarma

echo "1. Limpando alterações locais e forçando sincronização com GitHub (main)..."
git fetch origin main
git reset --hard origin/main
git clean -fd

echo "2. Parando todos os containers e removendo órfãos..."
sudo docker-compose down --remove-orphans

echo "3. Reconstruindo imagens SEM USAR CACHE (--no-cache)..."
sudo docker-compose build --no-cache

echo "4. Subindo os containers forçando recriação (--force-recreate)..."
sudo docker-compose up -d --force-recreate

echo "5. Limpando imagens antigas e não utilizadas do Docker..."
sudo docker image prune -f

echo "====================================================="
echo " ✅ ATUALIZAÇÃO HARDCORE CONCLUÍDA COM SUCESSO!      "
echo "====================================================="
sudo docker-compose ps
