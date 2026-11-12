@echo off
title BelaFarma - Instalador do PDV na Area de Trabalho
chcp 65001 > nul
color 0A

echo ======================================================================
echo       DROGARIA BELA FARMA SUL - INSTALADOR DO EXECUTAVEL DO PDV
echo ======================================================================
echo.
echo [1/4] Criando diretorio dedicado do PDV...
set "APP_DIR=%LOCALAPPDATA%\BelaFarmaPDV"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

echo [2/4] Detectando servidor da farmacia...
set "SERVER_HOST=192.168.1.70:3001"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tcp = New-Object Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 3001); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "SERVER_HOST=127.0.0.1:3001"
    echo       Servidor detectado nesta maquina (Localhost).
) else (
    echo       Servidor detectado na rede: %SERVER_HOST%
)

set "BAT_FILE=%APP_DIR%\INICIAR_PDV_NO_CAIXA.bat"
echo [3/4] Gerando executavel do terminal em %BAT_FILE%...

(
echo @echo off
echo title BelaFarma - PDV Frente de Caixa
echo chcp 65001 ^> nul
echo powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Printer ^| Where-Object { $_.Name -like '*MP-4200*' -or $_.Name -like '*Bematech*' -or $_.Name -like '*4200*' } ^| Select-Object -First 1; if ($p) { (Get-CimInstance Win32_Printer -Filter \"Name='$($p.Name)'\").SetDefaultPrinter() }" ^>nul 2^>^&1
echo set "SERVER_IP=%SERVER_HOST%"
echo set "URL=http://%%SERVER_IP%%/?app=pdv&isPrinterStation=true"
echo set "USER_DATA=%%LOCALAPPDATA%%\BelaFarmaPDV"
echo set "CHROME_64=C:\Program Files\Google\Chrome\Application\chrome.exe"
echo set "CHROME_32=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
echo set "EDGE_64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
echo set "EDGE_32=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
echo set "BROWSER_EXE="
echo if exist "%%CHROME_64%%" set "BROWSER_EXE=%%CHROME_64%%"
echo if not defined BROWSER_EXE if exist "%%CHROME_32%%" set "BROWSER_EXE=%%CHROME_32%%"
echo if not defined BROWSER_EXE if exist "%%EDGE_64%%" set "BROWSER_EXE=%%EDGE_64%%"
echo if not defined BROWSER_EXE if exist "%%EDGE_32%%" set "BROWSER_EXE=%%EDGE_32%%"
echo if defined BROWSER_EXE (
echo     start "" "%%BROWSER_EXE%%" --kiosk-printing --disable-print-preview --user-data-dir="%%USER_DATA%%" --app="%%URL%%" --start-maximized --window-size=1920,1080
echo ^) else (
echo     start "" "%%URL%%"
echo ^)
echo exit
) > "%BAT_FILE%"

echo [4/4] Criando atalho oficial "PDV BelaFarma" na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $d 'PDV BelaFarma.lnk')); $s.TargetPath = '%BAT_FILE%'; $s.WorkingDirectory = '%APP_DIR%'; $s.Description = 'Drogaria Bela Farma - Frente de Caixa PDV'; $s.WindowStyle = 7; $s.Save(); Write-Host '       Atalho criado com sucesso na Area de Trabalho!' -ForegroundColor Green"

echo.
echo ======================================================================
echo    INSTALACAO CONCLUIDA COM SUCESSO!
echo    O icone 'PDV BelaFarma' agora esta na sua Area de Trabalho.
echo ======================================================================
echo.
echo Abrindo o PDV agora...
start "" "%BAT_FILE%"
timeout /t 3 /nobreak >nul
exit
