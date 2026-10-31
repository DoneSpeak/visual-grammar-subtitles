import json
import os
from pathlib import Path
import pty
import select
import signal
import socket
import subprocess
import sys
import time

import pytest

from service import read_state, ready, running

ROOT = Path(__file__).resolve().parents[3]


class TestEnvironment(dict):
    __test__ = False

    def __repr__(self):
        return '<test subprocess environment>'


@pytest.fixture
def environment(tmp_path):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    env = TestEnvironment({k: v for k, v in os.environ.items() if not k.startswith('NLP_')})
    env.update(NLP_DATA_DIR=str(tmp_path), NLP_PORT=str(port))
    yield env
    subprocess.run(['make', 'nlp-stop'], cwd=ROOT, env=env, capture_output=True, timeout=25)


def make(env, *args):
    return subprocess.run(['make', *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=40)


def test_background_lifecycle(environment):
    directory = Path(environment['NLP_DATA_DIR'])
    first = make(environment, 'nlp-serve', 'NLP_ALLOWED_ORIGINS=chrome-extension://test')
    assert first.returncode == 0, first.stdout + first.stderr
    state = read_state(directory)
    assert state['token'] in first.stdout and state['url'] in first.stdout
    assert '下一步' in first.stdout and '检测已保存连接' in first.stdout
    assert ready(state) and running(state)
    assert state['token'] not in (directory / 'server.log').read_text()
    assert (directory / 'service.json').stat().st_mode & 0o777 == 0o600
    second = make(environment, 'nlp-serve')
    assert second.returncode == 0
    assert read_state(directory)['pid'] == state['pid']
    assert make(environment, 'nlp-stop').returncode == 0
    assert not running(state)
    assert make(environment, 'nlp-stop').returncode == 0
    assert make(environment, 'nlp-serve').returncode == 0
    restarted = read_state(directory)
    assert restarted['pid'] != state['pid']
    assert restarted['token'] == state['token']
    assert restarted['origins'] == 'chrome-extension://test'


@pytest.mark.parametrize('args,key', [
    (['nlp-serve', 'LOG=1'], b'\x03'),
    (['nlp-serve', '--', '--log'], b'\x1a'),
    (['nlp-serve-log'], b'\x03'),
    (['npl-serve-log'], b'\x1a'),
])
def test_exit_logs_keeps_server_running(environment, args, key):
    assert make(environment, 'nlp-serve').returncode == 0
    terminal, slave = pty.openpty()
    child_process = subprocess.Popen(
        [sys.executable, '-c', 'import fcntl, os, sys, termios; fcntl.ioctl(0, termios.TIOCSCTTY, 0); os.execvp("make", ["make", *sys.argv[1:]])', *args],
        cwd=ROOT, env=environment, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
    )
    os.close(slave)
    pid = child_process.pid
    output = b''
    reaped = False
    try:
        deadline = time.monotonic() + 10
        while '持续跟踪'.encode() not in output and time.monotonic() < deadline:
            if select.select([terminal], [], [], .1)[0]:
                output += os.read(terminal, 65536)
        assert '持续跟踪'.encode() in output, output.decode(errors='replace')
        os.write(terminal, key)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            # macOS may wait for pending PTY output to drain before process exit.
            if select.select([terminal], [], [], .05)[0]:
                try:
                    output += os.read(terminal, 65536)
                except OSError:
                    pass
            child, status = os.waitpid(pid, os.WNOHANG | os.WUNTRACED)
            if child:
                assert not os.WIFSTOPPED(status), 'Make was suspended instead of exiting the log viewer'
                reaped = True
                child_process.returncode = os.waitstatus_to_exitcode(status)
                assert os.waitstatus_to_exitcode(status) == 0
                break
        assert reaped, output.decode(errors='replace')
        assert ready(read_state(Path(environment['NLP_DATA_DIR'])))
    finally:
        if not reaped:
            foreground = os.tcgetpgrp(terminal)
            if foreground > 1 and foreground != os.getpgrp():
                try:
                    os.killpg(foreground, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
            if child_process.poll() is None:
                child_process.kill()
            child_process.wait(timeout=5)
        os.close(terminal)


def test_occupied_port_does_not_report_success(environment):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', int(environment['NLP_PORT'])))
        listener.listen()
        result = make(environment, 'nlp-serve')
    assert result.returncode != 0
    assert '服务启动失败' in result.stderr
    assert read_state(Path(environment['NLP_DATA_DIR'])) is None


def test_stale_pid_does_not_stop_unrelated_process(environment):
    directory = Path(environment['NLP_DATA_DIR'])
    with subprocess.Popen(['sleep', '30']) as other:
        try:
            (directory / 'service.json').write_text(json.dumps(dict(pid=other.pid, instance='stale')))
            assert make(environment, 'nlp-stop').returncode == 0
            assert other.poll() is None
        finally:
            other.terminate()
