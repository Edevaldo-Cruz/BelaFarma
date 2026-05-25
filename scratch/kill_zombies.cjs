const { execSync } = require('child_process');

function killOldAgents() {
  console.log('🔍 Buscando processos antigos do agent.js...');
  try {
    // Comando PowerShell cirúrgico para achar processos node rodando agent.js e obter os PIDs
    const psCommand = `powershell -command "Get-CimInstance Win32_Process -Filter \\"name='node.exe'\\" | Where-Object { $_.CommandLine -like '*agent.js*' } | Select-Object -ExpandProperty ProcessId"`;
    const output = execSync(psCommand).toString().trim();
    
    if (!output) {
      console.log('✅ Nenhum processo antigo de agent.js em background encontrado.');
      return;
    }

    const pids = output.split(/\r?\n/).map(pid => pid.trim()).filter(Boolean);
    console.log(`🤖 Encontrado(s) ${pids.length} processo(s) ativo(s): PIDs [${pids.join(', ')}]`);
    
    pids.forEach(pid => {
      try {
        console.log(`💀 Matando processo PID ${pid}...`);
        process.kill(parseInt(pid), 'SIGKILL');
      } catch (killErr) {
        // Fallback para taskkill se o process.kill falhar por permissões
        execSync(`taskkill /f /pid ${pid}`);
      }
    });
    console.log('🎉 Limpeza concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro durante a limpeza de processos:', err.message);
  }
}

killOldAgents();
