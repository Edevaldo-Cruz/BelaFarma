@echo off
echo ===============================================
echo COLETANDO LOGS DO BACKEND NA VPS
echo Digite a senha (2494) para se conectar via SSH.
echo ===============================================
ssh ed@192.168.1.70 "cd ~/projects/BelaFarma && docker-compose logs --tail=100 backend" > scratch\vps-backend-logs.txt
echo.
echo ===============================================
echo COMPLETO! Pressione qualquer tecla para fechar.
echo ===============================================
pause
