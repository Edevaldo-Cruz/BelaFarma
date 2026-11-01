@echo off
title BelaFarma - PDV Frente de Caixa (Impressao Direta Bematech)
chcp 65001 > nul

echo ======================================================================
echo       DROGARIA BELA FARMA - FRENTE DE CAIXA DE ALTA VELOCIDADE
echo       Modo Quiosque (Impressao Direta Silenciosa na Bematech)
echo ======================================================================
echo.

REM 1. Definir a Bematech MP-4200 TH deste computador como impressora padrao
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer | Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } | Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter(); Write-Host '[OK] Bematech configurada como impressora padrao:' $p.Name -ForegroundColor Green } else { Write-Host '[AVISO] Bematech nao detectada neste computador.' -ForegroundColor Yellow }"

REM 2. URL do Servidor BelaFarma
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
    echo [OK] Abrindo PDV no navegador com impressao silenciosa direta...
    start "" "%BROWSER_EXE%" --kiosk-printing --disable-print-preview --user-data-dir="%USER_DATA%" --app="%URL%"
) else (
    echo [AVISO] Navegador padrao em uso...
    start "" "%URL%"
)

echo.
echo PDV pronto para operar. Qualquer impressao ira direto para a Bematech sem abrir caixa de dialogo.
ping 127.0.0.1 -n 3 > nul
exit

