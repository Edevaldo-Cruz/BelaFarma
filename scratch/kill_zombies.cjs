const { execSync } = require('child_process');

try {
  console.log('🔍 Varrendo e matando processos órfãos do Chrome/Node vinculados ao robô...');

  // Comando PowerShell que mata processos do Chrome com a pasta do robô
  const psChrome = `powershell -command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*whatsapp-session-rpa*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Matou Chrome PID' $_.ProcessId }"`;
  try {
    const outChrome = execSync(psChrome).toString();
    console.log(outChrome || 'Nenhum processo do Chrome órfão encontrado.');
  } catch (e) {
    console.log('Sem processos do Chrome para limpar ou erro leve:', e.message);
  }

  // Comando PowerShell que mata processos do Node executando o agent.js (excluindo este processo atual!)
  const currentPid = process.pid;
  const psNode = `powershell -command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { $_.CommandLine -like '*agent.js*' -and $_.ProcessId -ne ${currentPid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Matou Node PID' $_.ProcessId }"`;
  try {
    const outNode = execSync(psNode).toString();
    console.log(outNode || 'Nenhum processo do Node órfão encontrado.');
  } catch (e) {
    console.log('Sem processos do Node para limpar ou erro leve:', e.message);
  }

  console.log('✅ Limpeza concluída!');
} catch (err) {
  console.error('Erro geral ao limpar zumbis:', err);
}
