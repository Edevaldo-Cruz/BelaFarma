import paramiko
import sys

# Ensure UTF-8 output encoding on Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def run_sudo_command(ssh, cmd, password='2494'):
    full_cmd = f"echo '{password}' | sudo -S bash -c \"{cmd}\""
    stdin, stdout, stderr = ssh.exec_command(full_cmd)
    out = stdout.read().decode('utf-8', errors='ignore').strip()
    err = stderr.read().decode('utf-8', errors='ignore').strip()
    err_lines = [line for line in err.split('\n') if '[sudo] password for' not in line]
    err_clean = '\n'.join(err_lines).strip()
    return out, err_clean

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password, timeout=10)
        print("Connected to VPS as user 'ed'.")
        
        commands = [
            "docker logs --tail=50 belafarma-backend-1",
            "docker logs --tail=50 belafarma-evolution-api-1"
        ]
        
        for cmd in commands:
            print(f"\n==========================================")
            print(f"Executing: {cmd}")
            print(f"==========================================")
            out, err = run_sudo_command(ssh, cmd, password)
            if out:
                print("--- STDOUT ---")
                print(out)
            if err:
                print("--- STDERR ---")
                print(err)
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
