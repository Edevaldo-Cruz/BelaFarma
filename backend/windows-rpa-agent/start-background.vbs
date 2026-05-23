Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c run-agent.bat", 0, false
