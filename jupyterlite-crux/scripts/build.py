from pathlib import Path
import os,subprocess,sys,venv
root=Path(__file__).resolve().parent.parent
os.chdir(root)
if sys.version_info < (3,10):raise SystemExit('Rebuild JupyterLite with Python 3.10 or newer.')
env=root/'.build-venv'
python=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
if not python.exists():venv.EnvBuilder(with_pip=True).create(env)
def run(*args):subprocess.run([str(a) for a in args],check=True,cwd=root)
run(python,'-m','pip','install','-r','requirements.txt')
run(env/('Scripts/jupyter.exe' if os.name=='nt' else 'bin/jupyter'),'lite','build','--apps','lab','--output-dir',root/'runtime')
run(python,'-m','pip','download','--no-deps','comm==0.2.3','--dest',root/'runtime/pyodide')
run(python,root/'scripts/bundle-python.py')
run(python,root/'scripts/configure.py')
