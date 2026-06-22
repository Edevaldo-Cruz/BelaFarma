import paramiko
import sys

def main():
    hostname = '192.168.1.70'
    username = 'root'
    password = '2494'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password, timeout=10)
        print("Connected to VPS.")
        
        commands = [
            "cd /home/ed/projects/BelaFarma && docker-compose ps"
        ]
        
        for cmd in commands:
            print(f"\nExecuting: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            out = stdout.read().decode('utf-8', errors='ignore').strip()
            err = stderr.read().decode('utf-8', errors='ignore').strip()
            if out:
                sys.stdout.buffer.write(b"STDOUT: " + out.encode('utf-8') + b"\n")
            if err:
                sys.stdout.buffer.write(b"STDERR: " + err.encode('utf-8') + b"\n")
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
