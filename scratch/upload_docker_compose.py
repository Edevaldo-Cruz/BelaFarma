import paramiko
import sys
import os

def main():
    local_file = 'docker-compose.yml'
    remote_file_path = '/home/ed/projects/BelaFarma/docker-compose.yml'
    
    if not os.path.exists(local_file):
        print(f"Error: Local file {local_file} not found.")
        sys.exit(1)
        
    with open(local_file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("Connecting to VPS via SSH...")
        ssh.connect(hostname, username=username, password=password, timeout=10)
        print("Connected! Opening SFTP session...")
        
        sftp = ssh.open_sftp()
        print(f"Uploading {local_file} to {remote_file_path}...")
        
        with sftp.file(remote_file_path, 'w') as f_remote:
            f_remote.write(content)
            
        print("Upload successful!")
        sftp.close()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
