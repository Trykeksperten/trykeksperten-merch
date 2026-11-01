# Fixed Linux limits, installed before any Node/PDF code runs. No application imports.
import os, sys, resource
if sys.platform != 'linux' or len(sys.argv) < 3:
    raise SystemExit(1)
for kind, value in [(resource.RLIMIT_AS,768*1024*1024),(resource.RLIMIT_DATA,192*1024*1024),(resource.RLIMIT_CPU,30),(resource.RLIMIT_CORE,0),(resource.RLIMIT_FSIZE,0)]:
    resource.setrlimit(kind,(value,value))
os.execve(sys.argv[1],sys.argv[1:],{'PATH':os.environ.get('PATH','/usr/local/bin:/usr/bin:/bin'),'UV_THREADPOOL_SIZE':'1','MALLOC_ARENA_MAX':'1','DISABLE_SYSTEM_FONTS_LOAD':'1'})
