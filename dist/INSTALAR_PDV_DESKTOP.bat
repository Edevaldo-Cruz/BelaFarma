@echo off
title BelaFarma - Instalador do PDV na Area de Trabalho
chcp 65001 > nul
color 0A

echo ======================================================================
echo       DROGARIA BELA FARMA SUL - INSTALADOR DO EXECUTAVEL DO PDV
echo ======================================================================
echo.
echo [1/3] Criando diretorio dedicado do PDV...
set "APP_DIR=%LOCALAPPDATA%\BelaFarmaPDV"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

echo [2/3] Detectando servidor da farmacia...
set "SERVER_HOST=192.168.1.70:3001"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tcp = New-Object Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 3001); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "SERVER_HOST=127.0.0.1:3001"
    echo       Servidor detectado nesta maquina (Localhost).
) else (
    echo       Servidor detectado na rede: %SERVER_HOST%
)

set "TARGET_URL=http://%SERVER_HOST%/?app=pdv"
set "USER_DATA=%APP_DIR%"

set "BROWSER_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

echo [3/3] Criando atalho oficial "PDV BelaFarma" na Area de Trabalho...
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\PDV BelaFarma.lnk"

if defined BROWSER_EXE (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%BROWSER_EXE%'; $s.Arguments = '--app=\"%TARGET_URL%\" --user-data-dir=\"%USER_DATA%\" --kiosk-printing --disable-print-preview --start-maximized'; $s.Description = 'Drogaria Bela Farma - Frente de Caixa PDV'; $s.Save()"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_URL%'; $s.Description = 'Drogaria Bela Farma - Frente de Caixa PDV'; $s.Save()"
)

echo.
echo ======================================================================
echo    INSTALACAO CONCLUIDA COM SUCESSO!
echo    O icone 'PDV BelaFarma' agora esta na sua Area de Trabalho.
echo ======================================================================
echo.
echo Abrindo o PDV agora...
start "" "%SHORTCUT_PATH%"
timeout /t 2 /nobreak >nul
exit
