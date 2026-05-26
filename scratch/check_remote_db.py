import os
import sys
import paramiko

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    local_js = r'f:\Documentos\Desenvolvimento\BelaFarma\scratch\check_db.js'
    remote_js = 'projects/BelaFarma/data/check_db.js'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password)
        print("Connected to VPS.")
        
        # 1. SFTP Upload
        sftp = ssh.open_sftp()
        try:
            sftp.put(local_js, remote_js)
            print("Uploaded check_db.js to VPS data folder.")
        finally:
            sftp.close()
            
        # 2. Execute
        cmd = "cd ~/projects/BelaFarma && docker-compose exec -T backend node data/check_db.js"
        print(f"Executing inside container: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        out = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        
        print("\n--- RESULTS FROM PRODUCTION CONTAINER ---")
        if out:
            # Strip emojis for CP1252 console printing
            clean_out = out.encode('ascii', 'ignore').decode('ascii')
            print(clean_out)
        if err:
            clean_err = err.encode('ascii', 'ignore').decode('ascii')
            print("Error:", clean_err)
            
        # 3. Clean up
        ssh.exec_command("rm ~/projects/BelaFarma/data/check_db.js")
        print("\nCleaned up check_db.js on VPS.")
        
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
