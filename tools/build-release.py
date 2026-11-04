"""Build a verified, code-only release for the SSH deploy workflow."""
import hashlib
import json
import re
import subprocess
import tarfile
from io import BytesIO
from pathlib import Path

root = Path(__file__).resolve().parent.parent
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
if not re.fullmatch(r'[a-f0-9]{40}', commit):
    raise SystemExit('Invalid source commit')
files = {}
for directory in ('public', 'server'):
    for path in sorted((root / directory).rglob('*')):
        if path.is_symlink():
            raise SystemExit('Release source must not contain symlinks')
        if path.is_file() and path.name not in ('router.php', 'config.php'):
            files[str(path.relative_to(root))] = path.read_bytes()
manifest = {'version': 1, 'commit': commit, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
files['install.php'] = (root / 'tools' / 'install-release.php').read_bytes()
target = root / 'dist' / 'm-rummy-release.tar.gz'
target.parent.mkdir(exist_ok=True)
with tarfile.open(target, 'w:gz') as archive:
    for name, data in files.items():
        info = tarfile.TarInfo(name)
        info.size, info.mode = len(data), 0o644
        archive.addfile(info, BytesIO(data))
print(target)
