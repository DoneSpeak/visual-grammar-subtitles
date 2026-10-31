"""Local POSIX service lifecycle used by the Makefile."""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from uuid import uuid4

from config import data_directory, load_api_token

SCRIPT = Path(__file__).resolve()


def read_state(directory):
    try:
        return json.loads((directory / 'service.json').read_text())
    except (FileNotFoundError, ValueError):
        return None


def running(state):
    if not state or not isinstance(state.get('pid'), int) or state['pid'] <= 1:
        return False
    result = subprocess.run(['ps', '-p', str(state['pid']), '-o', 'command='], capture_output=True, text=True)
    # A random per-launch marker avoids signalling an unrelated reused PID.
    return result.returncode == 0 and f'{SCRIPT} _run {state["instance"]}' in result.stdout


@contextmanager
def control_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'service.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def write_state(directory, state):
    path = directory / 'service.json'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(state, stream)


def ready(state):
    request = urllib.request.Request(state['url'] + '/api/v1/capabilities', headers={'Authorization': f'Bearer {state["token"]}'})
    try:
        # Local checks must not go through a user's HTTP proxy.
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=1) as response:
            return response.status == 200 and response.headers.get('X-NLP-Service-Instance') == state['instance']
    except (OSError, urllib.error.URLError):
        return False


def stop_process(state):
    if not running(state):
        return
    pid = state['pid']
    try:
        if os.getpgid(pid) != pid:
            raise RuntimeError('服务进程组不匹配，未发送停止信号。')
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 15
        while running(state) and time.monotonic() < deadline:
            time.sleep(.1)
        if running(state):
            os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def instructions(state, directory):
    print(f'\nNLP 服务已在后台运行（PID {state["pid"]}），关闭终端不会停止服务。')
    print(f'\n服务 URL：{state["url"]}\nAPI Token：{state["token"]}')
    print(f'设置页面：{state["url"]}/ui/（可复制 URL/Token、增删允许来源，改完立即生效）')
    print('\n下一步：\n1. 打开设置页面，复制服务 URL 和 API Token。\n2. 打开插件设置 → 颜色 → Japanese NLP，勾选“启用 Remote NLP”，填入并保存。')
    if state['origins']:
        print(f'3. 允许来源已配置：{state["origins"]}；点击“检测已保存连接”，成功后选择日语字幕。')
    else:
        print('3. 回到插件点击“检测已保存连接”。若提示来源未允许，刷新设置页面，在“检测到的新扩展来源”里点“允许”，再检测一次。无需重启服务。')
    print('\n查看日志：make nlp-serve-log（也支持 make npl-serve-log）')
    print('启动并查看日志：make nlp-serve LOG=1')
    print('停止服务：make nlp-stop')
    print(f'日志文件：{directory / "server.log"}')
    if directory != SCRIPT.parent / '.data':
        print(f'使用了自定义数据目录；后续命令请同样带上 NLP_DATA_DIR={shlex.quote(str(directory))}')
    print(flush=True)


def start(directory, port):
    with control_lock(directory):
        state = read_state(directory)
        if running(state):
            print('服务已经启动，复用当前后台进程。配置变更请先 make nlp-stop，再重新启动。')
        else:
            token = load_api_token(directory)
            # Remember the explicit whitelist so routine starts don't need to repeat it.
            saved = directory / 'allowed-origins'
            origins = os.environ.get('NLP_ALLOWED_ORIGINS')
            if origins is None:
                origins = saved.read_text().strip() if saved.exists() else ''
            instance = uuid4().hex
            env = dict(os.environ, NLP_DATA_DIR=str(directory), NLP_API_TOKEN=token, NLP_ALLOWED_ORIGINS=origins, NLP_SERVICE_INSTANCE=instance)
            log_fd = os.open(directory / 'server.log', os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(log_fd, 'a') as log:
                log.write(f'\n--- NLP 服务启动 {time.strftime("%Y-%m-%d %H:%M:%S")} ---\n')
                log.flush()
                child = subprocess.Popen([sys.executable, str(SCRIPT), '_run', instance, '--port', str(port)],
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                         env=env, start_new_session=True, close_fds=True)
            state = dict(pid=child.pid, instance=instance, token=token, origins=origins, url=f'http://127.0.0.1:{port}')
            try:
                write_state(directory, state)
                deadline = time.monotonic() + 30
                while child.poll() is None and time.monotonic() < deadline:
                    if ready(state) and child.poll() is None:
                        saved.write_text(origins)
                        break
                    time.sleep(.1)
                else:
                    raise RuntimeError(f'服务启动失败（端口可能被占用）。运行 make nlp-serve-log 查看日志：{directory / "server.log"}')
            except BaseException:
                stop_process(state)
                child.wait(timeout=5)
                (directory / 'service.json').unlink(missing_ok=True)
                raise
    instructions(state, directory)


def stop(directory):
    with control_lock(directory):
        state = read_state(directory)
        active = running(state)
        if active:
            stop_process(state)
        (directory / 'service.json').unlink(missing_ok=True)
    print('NLP 服务已停止。' if active else 'NLP 服务当前没有运行。')


@contextmanager
def log_signals():
    stopped = False

    def leave(signum, frame):
        nonlocal stopped
        stopped = True

    handlers = {s: signal.signal(s, leave) for s in (signal.SIGINT, signal.SIGTSTP)}
    previous_group = None
    old_ttou = signal.signal(signal.SIGTTOU, signal.SIG_IGN)
    try:
        # Give the viewer the foreground TTY so Ctrl-Z doesn't suspend Make itself.
        if sys.stdin.isatty():
            previous_group = os.tcgetpgrp(sys.stdin.fileno())
            if os.getpgrp() != os.getpid():
                os.setpgid(0, 0)
            os.tcsetpgrp(sys.stdin.fileno(), os.getpgrp())
        yield lambda: stopped
    finally:
        if previous_group is not None:
            os.tcsetpgrp(sys.stdin.fileno(), previous_group)
        signal.signal(signal.SIGTTOU, old_ttou)
        for sig, handler in handlers.items():
            signal.signal(sig, handler)


def logs(directory):
    path = directory / 'server.log'
    if not path.exists():
        print('还没有日志。请先执行 make nlp-serve。')
        return
    with log_signals() as stopped, path.open('rb') as stream:
        print('显示最近日志并持续跟踪。按 Ctrl+C 或 Ctrl+Z 退出日志，后台服务保持运行。', flush=True)
        stream.seek(max(0, path.stat().st_size - 65536))
        recent = stream.read().decode('utf-8', errors='replace').splitlines(keepends=True)
        print(''.join(recent[-60:]), end='', flush=True)
        while not stopped():
            line = stream.readline()
            if line:
                print(line.decode('utf-8', errors='replace'), end='', flush=True)
            else:
                time.sleep(.1)
    print('\n已退出日志查看；后台服务不受影响。', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['start', 'stop', 'logs', '_run'])
    parser.add_argument('instance', nargs='?')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--log', action='store_true')
    args = parser.parse_args()
    if args.action == '_run':
        import uvicorn
        uvicorn.run('app:create_app', factory=True, host='127.0.0.1', port=args.port)
        return
    directory = data_directory().resolve()
    try:
        if args.action == 'start':
            start(directory, args.port)
            if args.log:
                logs(directory)
        elif args.action == 'stop':
            stop(directory)
        else:
            logs(directory)
    except (OSError, RuntimeError, ValueError) as error:
        print(f'错误：{error}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
