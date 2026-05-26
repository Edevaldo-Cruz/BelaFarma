import os
import sys
import paramiko

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    remote_dir = 'projects/BelaFarma'
    local_env_path = r'f:\Documentos\Desenvolvimento\BelaFarma\.env'
    remote_env_path = f'{remote_dir}/.env'

    print("=== SSH/SFTP DEPLOYMENT TO BELAFARMA ===")
    
    # Initialize SSH client
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"Connecting to {username}@{hostname}...")
        ssh.connect(hostname, username=username, password=password, timeout=15)
        print("Connected successfully!")
        
        # 1. SFTP Upload .env
        print(f"Uploading {local_env_path} to {remote_env_path}...")
        sftp = ssh.open_sftp()
        try:
            sftp.put(local_env_path, remote_env_path)
            print("Upload completed successfully!")
        finally:
            sftp.close()
            
        # 2. Execute git and docker-compose commands
        commands = [
            f"cd {remote_dir} && git fetch origin",
            f"cd {remote_dir} && git reset --hard origin/main",
            f"cd {remote_dir} && docker-compose up -d --build"
        ]
        
        for cmd in commands:
            print(f"\nExecuting: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            
            # Read stdout and stderr in real-time or completely
            out = stdout.read().decode('utf-8', errors='ignore')
            err = stderr.read().decode('utf-8', errors='ignore')
            
            if out:
                print("[STDOUT]")
                print(out)
            if err:
                print("[STDERR]")
                print(err)
                
        print("\n=== DEPLOYMENT COMPLETED! ===")
        
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
