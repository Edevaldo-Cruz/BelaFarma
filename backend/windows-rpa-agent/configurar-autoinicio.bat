@echo off
title Configurar Inicio Automatico com o Windows - BelaFarma
echo ============================================================
echo   CONFIGURANDO ROBÔ DE WHATSAPP PARA INICIAR COM O WINDOWS
echo ============================================================
echo.

set SCRIPT_PATH=%~dp0iniciar-robo.bat
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_FOLDER%\RoboBelaFarma.lnk

echo Criando atalho no Inicializar do Windows...
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%SCRIPT_PATH%';$s.WorkingDirectory='%~dp0';$s.Save()"

echo.
echo ============================================================
echo ✅ CONCLUÍDO COM SUCESSO!
echo O Robô de WhatsApp da BelaFarma agora vai iniciar automaticamente 
echo sempre que este computador for ligado!
echo ============================================================
echo.
pause
