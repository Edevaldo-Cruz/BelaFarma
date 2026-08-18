import paramiko
import sys
import time

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
    remote_dir = '/home/ed/projects/BelaFarma'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"Connecting to {username}@{hostname}...")
        ssh.connect(hostname, username=username, password=password, timeout=15)
        print("Connected successfully!")
        
        commands = [
            f"cd {remote_dir} && git fetch origin && git reset --hard origin/main",
            f"cd {remote_dir} && docker-compose down",
            f"cd {remote_dir} && docker-compose build",
            f"cd {remote_dir} && docker-compose up -d"
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
                
        print("\nWaiting 10 seconds for containers to stabilize...")
        time.sleep(10)
        
        print("\n==========================================")
        print("Checking container status (docker ps)...")
        print("==========================================")
        out, err = run_sudo_command(ssh, "docker ps", password)
        if out:
            print("--- STDOUT ---")
            print(out)
        if err:
            print("--- STDERR ---")
            print(err)
            
    except Exception as e:
        print(f"Deploy error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
