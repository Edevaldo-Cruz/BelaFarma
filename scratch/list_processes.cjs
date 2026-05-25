const { execSync } = require('child_process');

function listProcesses() {
  console.log('🔍 Mapeando processos do Node.js...');
  try {
    const psCommand = `powershell -command "Get-CimInstance Win32_Process -Filter \\"name='node.exe'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"`;
    const output = execSync(psCommand).toString().trim();
    if (!output) {
      console.log('Nenhum processo Node.exe encontrado.');
      return;
    }
    
    // Converte para JSON
    let list = JSON.parse(output);
    if (!Array.isArray(list)) {
      list = [list];
    }

    list.forEach(proc => {
      console.log(`- PID: ${proc.ProcessId} | CMD: "${proc.CommandLine}"`);
    });
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

listProcesses();
