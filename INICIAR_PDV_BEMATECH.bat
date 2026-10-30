@echo off
title BelaFarma - PDV Frente de Caixa (Impressao Direta Bematech)
chcp 65001 > nul

echo ======================================================================
echo       DROGARIA BELA FARMA - FRENTE DE CAIXA DE ALTA VELOCIDADE
echo       Modo Quiosque (Impressao Direta Silenciosa na Bematech)
echo ======================================================================
echo.

:: 1. Definir a Bematech MP-4200 TH como impressora padrao do Windows automaticamente se estiver instalada
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer | Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } | Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter(); Write-Host '[OK] Impressora Bematech padronizada no Windows:' $p.Name -ForegroundColor Green } else { Write-Host '[INFO] Verifique se a Bematech esta definida como padrao no Painel de Controle.' -ForegroundColor Yellow }"

:: 2. Parametros do Navegador PDV
set URL=http://localhost:3001
set USER_DATA="%LOCALAPPDATA%\BelaFarmaPDV"
set KIOSK_FLAGS=--kiosk-printing --disable-print-preview --user-data-dir=%USER_DATA% --app=%URL%

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set CHROME_X86="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set EDGE_64="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist %CHROME_PATH% (
    echo [OK] Abrindo PDV no Google Chrome com impressao silenciosa direta...
    start "" %CHROME_PATH% %KIOSK_FLAGS%
    goto final
)

if exist %CHROME_X86% (
    echo [OK] Abrindo PDV no Google Chrome (x86) com impressao silenciosa direta...
    start "" %CHROME_X86% %KIOSK_FLAGS%
    goto final
)

if exist %EDGE_PATH% (
    echo [OK] Abrindo PDV no Microsoft Edge com impressao silenciosa direta...
    start "" %EDGE_PATH% %KIOSK_FLAGS%
    goto final
)

if exist %EDGE_64% (
    echo [OK] Abrindo PDV no Microsoft Edge com impressao silenciosa direta...
    start "" %EDGE_64% %KIOSK_FLAGS%
    goto final
)

echo [AVISO] Navegador padrao nao encontrado nos diretorios habituais. Abrindo na sessao padrao...
start "" %URL%

:final
echo.
echo PDV pronto para operar. Qualquer impressao ira direto para a Bematech sem abrir caixa de dialogo.
timeout /t 3 > nul
exit
