# Deploy Script para BelaFarma (Raspberry Pi)
$PROD_USER = "ed"
$PROD_IP = "192.168.1.70"
$REMOTE_DIR = "/home/ed/projects/BelaFarma"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   🚀 DEPLOY HARD & LIMPO - BELAFARMA (192.168.1.70)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Enviando arquivo .env para o servidor..." -ForegroundColor Yellow
Write-Host "Digite a senha (2494) se solicitado:" -ForegroundColor DarkGray
scp .env "@:/.env"

Write-Host ""
Write-Host "[2/3] Atualizando e Reconstruindo na VPS..." -ForegroundColor Yellow
Write-Host "- Resetando branch main na VPS..." -ForegroundColor DarkGray
Write-Host "- Derrubando containers antigos..." -ForegroundColor DarkGray
Write-Host "- Limpando imagens orfas..." -ForegroundColor DarkGray
Write-Host "- Reconstruindo sem cache (--no-cache)..." -ForegroundColor DarkGray
Write-Host "- Subindo containers..." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Digite a senha (2494) se solicitado:" -ForegroundColor DarkGray

ssh -t "@" "cd  && git fetch origin && git reset --hard origin/main && docker-compose down --remove-orphans && docker image prune -f && docker-compose build --no-cache && docker-compose up -d && docker-compose ps"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host "   ✅ DEPLOY CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
    Write-Host "   🌐 Servidor ativo em http://" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  Ocorreu algum aviso ou erro durante o deploy." -ForegroundColor Red
}

Read-Host "Pressione Enter para sair..."
