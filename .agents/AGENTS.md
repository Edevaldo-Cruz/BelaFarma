# REGRAS DO PROJETO BELAFARMA

## ⚠️ IMPORTANTE: NÃO ESTAMOS USANDO O RENDER!
**ESTAMOS USANDO UMA RASPBERRY PI 4 COMO SERVIDOR (VPS CASEIRA LOCAL no IP 192.168.1.70).**

- **Hospedagem de Produção**: O servidor real de produção roda localmente em uma **Raspberry Pi 4** (no endereço de rede local `192.168.1.70`).
- **Acesso ao Servidor**: O acesso administrativo é feito via SSH com o usuário `ed` (`ssh ed@192.168.1.70`).
- **Diretório do Projeto**: O código no servidor fica em `/home/ed/projetcs/BelaFarma`.
- **Procedimento de Deploy**: O deploy consiste em fazer `git pull origin main` no servidor e reiniciar os containers via `docker-compose down && docker-compose build && docker-compose up -d`.
