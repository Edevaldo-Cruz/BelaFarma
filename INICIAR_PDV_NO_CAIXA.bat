@echo off
title BelaFarma - Iniciar PDV no Computador do Caixa
chcp 65001 > nul

echo ======================================================================
echo    DROGARIA BELA FARMA - TERMINAL DO CAIXA COM BEMATECH MP-4200 TH
echo ======================================================================
echo.

:: 1. Definir a Bematech MP-4200 TH deste computador como impressora padrao do Windows
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer | Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } | Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter(); Write-Host '[OK] Bematech definida como impressora padrao do Caixa:' $p.Name -ForegroundColor Green } else { Write-Host '[AVISO] Bematech nao detectada automaticamente. Defina como impressora padrao no Windows.' -ForegroundColor Yellow }"

:: 2. IP do Servidor BelaFarma na rede local
set SERVER_IP=192.168.1.4:3001
set URL=http://%SERVER_IP%

:: Parametros para Impressao Silenciosa 100%% Direta (sem janela de confirmacao)
set USER_DATA="%LOCALAPPDATA%\BelaFarmaPDV"
set KIOSK_FLAGS=--kiosk-printing --disable-print-preview --user-data-dir=%USER_DATA% --app=%URL%

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set CHROME_X86="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set EDGE_64="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist %CHROME_PATH% (
    echo [OK] Abrindo PDV no Google Chrome (Modo Direto sem dialogo)...
    start "" %CHROME_PATH% %KIOSK_FLAGS%
    goto final
)

if exist %CHROME_X86% (
    echo [OK] Abrindo PDV no Google Chrome x86 (Modo Direto sem dialogo)...
    start "" %CHROME_X86% %KIOSK_FLAGS%
    goto final
)

if exist %EDGE_PATH% (
    echo [OK] Abrindo PDV no Microsoft Edge (Modo Direto sem dialogo)...
    start "" %EDGE_PATH% %KIOSK_FLAGS%
    goto final
)

if exist %EDGE_64% (
    echo [OK] Abrindo PDV no Microsoft Edge 64 (Modo Direto sem dialogo)...
    start "" %EDGE_64% %KIOSK_FLAGS%
    goto final
)

echo [AVISO] Navegador padrao nao encontrado. Abrindo sessao normal...
start "" %URL%

:final
echo.
echo Terminal Caixa iniciado com sucesso!
echo As impressoes serao enviadas direto para a Bematech conectada neste PC.
timeout /t 3 > nul
exit
