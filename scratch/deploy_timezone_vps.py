import paramiko
import os
import sys

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    local_dc_path = r'F:\Documentos\Desenvolvimento\BelaFarma\docker-compose.yml'
    remote_dc_path = 'projects/BelaFarma/docker-compose.yml'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("Connecting to VPS via SSH...")
        ssh.connect(hostname, username=username, password=password, timeout=10)
        print("Connected successfully!")
        
        # 1. SFTP Upload docker-compose.yml
        print(f"Uploading local {local_dc_path} to remote {remote_dc_path}...")
        sftp = ssh.open_sftp()
        try:
            sftp.put(local_dc_path, remote_dc_path)
            print("Upload completed successfully!")
        finally:
            sftp.close()
            
        # 2. Executar docker-compose up -d para recriar com a nova TZ
        cmd = "cd ~/projects/BelaFarma && docker-compose up -d"
        print(f"\nExecuting: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()
        if out:
            print("[STDOUT]")
            print(out)
        if err:
            print("[STDERR]")
            print(err)
            
        # 3. Validar a nova data no container
        cmd_validate = "cd ~/projects/BelaFarma && docker-compose exec -T backend date"
        print(f"\nExecuting: {cmd_validate}")
        stdin, stdout, stderr = ssh.exec_command(cmd_validate)
        out_v = stdout.read().decode('utf-8', errors='ignore').strip()
        print("STDOUT (backend container date):", out_v)
        
        print("\n=== TIMEZONE DEPLOYMENT COMPLETED! ===")
        
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
