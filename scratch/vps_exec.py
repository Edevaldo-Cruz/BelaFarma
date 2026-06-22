import sys
import paramiko

def main():
    if len(sys.argv) < 2:
        print("Usage: python vps_exec.py <command>")
        sys.exit(1)
        
    command = " ".join(sys.argv[1:])
    
    hostname = "192.168.1.70"
    username = "ed"
    password = "2494"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(hostname, username=username, password=password, timeout=10)
        stdin, stdout, stderr = client.exec_command(command)
        
        # Wait for command to exit
        exit_status = stdout.channel.recv_exit_status()
        
        out = stdout.read()
        err = stderr.read()
        
        if out:
            sys.stdout.buffer.write(out)
        if err:
            sys.stderr.buffer.write(err)
            
        sys.exit(exit_status)
    except Exception as e:
        print(f"SSH Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()
