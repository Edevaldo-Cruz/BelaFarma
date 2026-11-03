@echo off
title Destravar Caixa Digifarma - Venda Fantasma
color 0E
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo    DROGARIA BELA FARMA - DESTRAVAR CAIXA DO DIGIFARMA
echo ======================================================================
echo.
echo [1/2] Verificando conexao com o Firebird do Digifarma...
echo [2/2] Localizando vendas fantasmas e pre-vendas abertas...
echo.

node backend/scripts/diagnosticar-venda-fantasma.cjs

echo.
echo ======================================================================
echo Fim do processo. Pressione qualquer tecla para sair...
echo ======================================================================
pause >nul
