import paramiko

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password)
        print("Connected to VPS.")
        
        # Read the last 100 lines of backend.log
        cmd = "tail -n 100 ~/projects/BelaFarma/data/backend.log"
        print(f"Executing: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        out = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        
        print("\n--- LAST 100 LINES OF BACKEND LOG ---")
        if out:
            # Strip emojis for CP1252 print
            clean_out = out.encode('ascii', 'ignore').decode('ascii')
            print(clean_out)
        if err:
            clean_err = err.encode('ascii', 'ignore').decode('ascii')
            print("Error:", clean_err)
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
