import os
import sys
import paramiko

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    local_js = r'f:\Documentos\Desenvolvimento\BelaFarma\scratch\clear_offers.js'
    remote_js = 'projects/BelaFarma/data/clear_offers.js'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password)
        print("Connected to VPS.")
        
        # 1. SFTP Upload
        sftp = ssh.open_sftp()
        try:
            sftp.put(local_js, remote_js)
            print("Uploaded clear_offers.js to VPS data folder.")
        finally:
            sftp.close()
            
        # 2. Execute
        cmd = "cd ~/projects/BelaFarma && docker-compose exec -T backend node data/clear_offers.js"
        print(f"Executing: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        out = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        
        print("\n--- EXECUTION RESULTS ---")
        if out:
            # Strip emojis for CP1252 print
            clean_out = out.encode('ascii', 'ignore').decode('ascii')
            print(clean_out)
        if err:
            clean_err = err.encode('ascii', 'ignore').decode('ascii')
            print("Error:", clean_err)
            
        # 3. Clean up
        ssh.exec_command("rm ~/projects/BelaFarma/data/clear_offers.js")
        print("\nCleaned up clear_offers.js on VPS.")
        
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
