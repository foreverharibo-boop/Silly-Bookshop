#!/usr/bin/env python3
"""Fail closed for secret-shaped files, then export only explicit public roots."""
from pathlib import Path
import hashlib,json,re,sys,zipfile,subprocess
root=Path(__file__).resolve().parents[1]
subprocess.run(['node',str(root/'scripts/build-renderer.cjs'),'--check'],check=True)
top={'.gitignore','.gitattributes','package.json','setup.cjs','README.md','SECURITY.md','TESTING.md','PUBLISHING.md','CHANGELOG.md'}
trees={'server','scripts','client'}
android_files={'android/AndroidManifest.xml','android/build.sh'}
android_trees=('android/src/','android/res/','android/tests/')
allowed_suffix={'.cjs','.js','.html','.css','.svg','.json','.py','.java','.xml','.sh','.md'}
secret_name=re.compile(r'(?i)(password\.txt|auth\.json|reading\.json|settings\.json|secrets\.json|\.env(?:\..*)?|.*\.(?:p12|pfx|jks|keystore|key|pem|jsonl))$')
secret_text=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}')
files=[]
for p in sorted(root.rglob('*')):
    rel=p.relative_to(root).as_posix();parts=p.relative_to(root).parts
    if parts[0] in {'.git','dist','node_modules'} or rel.startswith('android/build/') or '__pycache__' in parts:continue
    if p.is_symlink():raise SystemExit('Refusing symlink: '+rel)
    if not p.is_file():continue
    if secret_name.fullmatch(p.name) or any(n in {'signing','.sili-library'} for n in parts):raise SystemExit('Private file found. Move it outside repository: '+rel)
    allowed=rel in top or (parts[0] in trees and p.suffix in allowed_suffix) or rel in android_files or (rel.startswith(android_trees) and p.suffix in allowed_suffix)
    if not allowed:raise SystemExit('Unreviewed file outside public allowlist: '+rel)
    if secret_text.search(p.read_bytes()):raise SystemExit('Potential secret pattern: '+rel)
    files.append(p)
required=top|{'server/index.cjs','server/core.cjs','server/security.cjs','server/public/index.html','android/src/app/sili/library/MainActivity.java'}
missing=required-{p.relative_to(root).as_posix() for p in files}
if missing:raise SystemExit('Missing public files: '+', '.join(sorted(missing)))
print('Public allowlist and secret-pattern scan passed:',len(files),'files')
if '--check' in sys.argv:raise SystemExit(0)
version=json.loads((root/'package.json').read_text())['version']
dest=root/'dist';dest.mkdir(exist_ok=True)
output=dest/('silly-bookshop-github-'+version+'.zip')
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for p in files:archive.write(p,'silly-bookshop/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(secret_name.fullmatch(Path(name).name) for name in archive.namelist())
artifacts=[output]+sorted(dest.glob('*.apk'))
(dest/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in artifacts))
print(output.name)
