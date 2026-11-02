# CI-only launcher: move the real web process, then exec Node before app imports.
import os, sys
from pathlib import Path
if sys.platform != 'linux' or len(sys.argv) < 4:
    raise SystemExit('Linux synthetic cgroup launcher required')
current = next(line[3:] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
parent = Path('/sys/fs/cgroup' + current).parent
web = Path(sys.argv[1])
if Path(current).name != 'driver' or web != parent / 'web' or not parent.name.startswith('smerch-load-'):
    raise SystemExit('Unexpected synthetic cgroup')
if int((web / 'memory.max').read_text()) != 512 * 1024 * 1024 or (web / 'cpu.max').read_text().strip() != '50000 100000':
    raise SystemExit('Synthetic web limits not applied')
(web / 'cgroup.procs').write_text(str(os.getpid()))
os.set_inheritable(3, True)  # Retain the existing test IPC channel across exec.
os.execve(sys.argv[2], sys.argv[2:], dict(os.environ))
