import os
import sys
import paramiko


def run_command(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command, get_pty=True)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="ignore")
    err = stderr.read().decode("utf-8", errors="ignore")
    return exit_code, out, err


def main():
    host = os.environ.get("A2_HOST", "springvalleyseafood.com")
    user = os.environ.get("A2_USER", "springv1")
    password = os.environ.get("A2_PASS")
    command = os.environ.get("A2_CMD")
    if not password or not command:
        print("Missing A2_PASS or A2_CMD", file=sys.stderr)
        sys.exit(2)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        hostname=host,
        username=user,
        password=password,
        timeout=30,
        auth_timeout=30,
        banner_timeout=60,
        look_for_keys=False,
        allow_agent=False,
    )
    code, out, err = run_command(ssh, command)
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    ssh.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
