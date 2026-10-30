@echo off
title BelaFarma - Iniciar PDV com Impressao Silenciosa Bematech
chcp 65001 > nul

echo ========================================================
echo   DROGARIA BELA FARMA - FRENTE DE CAIXA (PDV)
echo   Modo Quiosque & Impressao Direta Bematech MP-4200 TH
echo ========================================================
echo.

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set URL=http://localhost:3001

if exist %CHROME_PATH% (
    echo Iniciando Google Chrome com --kiosk-printing...
    start "" %CHROME_PATH% --kiosk-printing --app=%URL%
    goto final
)

if exist %EDGE_PATH% (
    echo Iniciando Microsoft Edge com --kiosk-printing...
    start "" %EDGE_PATH% --kiosk-printing --app=%URL%
    goto final
)

echo [AVISO] Navegador padrao nao encontrado nos caminhos habituais. Abrindo URL padrao...
start "" %URL%

:final
echo.
echo PDV iniciado! As impressoes serao enviadas direto para a impressora padrao do Windows.
timeout /t 3 > nul
exit
