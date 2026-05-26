import paramiko
import sys

def main():
    hostname = '192.168.1.70'
    username = 'ed'
    password = '2494'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password, timeout=10)
        print("Connected to VPS.")
        
        commands = [
            "date",
            "cd ~/projects/BelaFarma && docker-compose exec -T backend date",
            "cd ~/projects/BelaFarma && docker-compose exec -T backend node -e \"console.log(new Date().toString() + ' | timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone)\""
        ]
        
        for cmd in commands:
            print(f"\nExecuting: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            out = stdout.read().decode('utf-8', errors='ignore').strip()
            err = stderr.read().decode('utf-8', errors='ignore').strip()
            if out:
                print("STDOUT:", out)
            if err:
                print("STDERR:", err)
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
