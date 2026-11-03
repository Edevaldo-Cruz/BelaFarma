@echo off
title Extrair Fornecedores do Digifarma - Bela Farma
color 0B
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo       ?? DROGARIA BELA FARMA - EXTRAÇÃO DE FORNECEDORES DO DIGIFARMA
echo ======================================================================
echo.
echo [INFO] Conectando ao banco Firebird do Digifarma (192.168.1.7:3050)...
echo [INFO] Sincronizando dados fiscais e cadastrais na tabela local...
echo.

node backend/scripts/extrair-fornecedores-digifarma.cjs

echo.
echo ======================================================================
echo Execução finalizada. Pressione qualquer tecla para fechar...
echo ======================================================================
pause >nul
