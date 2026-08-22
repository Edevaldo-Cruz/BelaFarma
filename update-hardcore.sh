#!/bin/bash
set -e

echo "====================================================="
echo " 🔥 INICIANDO ATUALIZAÇÃO HARDCORE (BelaFarma VPS) 🔥"
echo "====================================================="

cd /home/ed/projects/BelaFarma

echo "1. Ajustando permissões de arquivos criados pelo Docker (root -> ed)..."
sudo chown -R ed:ed /home/ed/projects/BelaFarma || true

echo "2. Forçando sincronização com GitHub (main)..."
git fetch origin main
git reset --hard origin/main
git clean -fd -e "*.db*" -e "*backup*" -e "data*" -e "*session*" || true

echo "3. Parando todos os containers e removendo órfãos..."
sudo docker-compose down --remove-orphans

echo "4. Reconstruindo imagens SEM USAR CACHE (--no-cache)..."
sudo docker-compose build --no-cache

echo "5. Subindo os containers forçando recriação (--force-recreate)..."
sudo docker-compose up -d --force-recreate

echo "6. Limpando imagens antigas e não utilizadas do Docker..."
sudo docker image prune -f

echo "====================================================="
echo " ✅ ATUALIZAÇÃO HARDCORE CONCLUÍDA COM SUCESSO!      "
echo "====================================================="
sudo docker-compose ps
