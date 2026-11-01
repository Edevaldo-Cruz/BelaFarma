@echo off
title BelaFarma - Iniciar PDV no Computador do Caixa
chcp 65001 > nul

echo ======================================================================
echo    DROGARIA BELA FARMA - TERMINAL DO CAIXA COM BEMATECH MP-4200 TH
echo ======================================================================
echo.

REM 1. Definir a Bematech MP-4200 TH deste computador como impressora padrao
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer | Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } | Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter(); Write-Host '[OK] Bematech configurada como impressora padrao do Caixa:' $p.Name -ForegroundColor Green } else { Write-Host '[AVISO] Bematech nao detectada neste computador. Se estiver em outro PC, use o modo rede.' -ForegroundColor Yellow }"

REM 2. URL do Servidor BelaFarma na rede local
set "SERVER_IP=192.168.1.70:3001"
set "URL=http://%SERVER_IP%?isPrinterStation=true"
set "USER_DATA=%LOCALAPPDATA%\BelaFarmaPDV"

REM 3. Localizar navegador Chrome ou Edge
set "CHROME_64=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_32=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set "EDGE_32=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

set "BROWSER_EXE="
if exist "%CHROME_64%" set "BROWSER_EXE=%CHROME_64%"
if not defined BROWSER_EXE if exist "%CHROME_32%" set "BROWSER_EXE=%CHROME_32%"
if not defined BROWSER_EXE if exist "%EDGE_64%" set "BROWSER_EXE=%EDGE_64%"
if not defined BROWSER_EXE if exist "%EDGE_32%" set "BROWSER_EXE=%EDGE_32%"

if defined BROWSER_EXE (
    echo [OK] Abrindo PDV com impressao direta na Bematech sem janelas de dialogo...
    start "" "%BROWSER_EXE%" --kiosk-printing --disable-print-preview --user-data-dir="%USER_DATA%" --app="%URL%"
) else (
    echo [AVISO] Navegador nao encontrado nos caminhos padrao. Abrindo sessao padrao...
    start "" "%URL%"
)

echo.
echo Terminal Caixa iniciado com sucesso!
echo As impressoes serao enviadas direto para a Bematech conectada neste PC.
ping 127.0.0.1 -n 3 > nul
exit

