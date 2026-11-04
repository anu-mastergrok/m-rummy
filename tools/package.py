"""Build the Hostinger upload layout using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
target = root / 'dist' / 'm-rummy-hostinger.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in sorted((root / 'public').rglob('*')):
        if path.is_file() and path.name != 'router.php':
            archive.write(path, 'public_html/' + str(path.relative_to(root / 'public')))
    for path in sorted((root / 'server').iterdir()):
        if path.is_file() and path.name != 'config.php':
            archive.write(path, 'server/' + path.name)
    archive.write(root / 'docs' / 'HOSTINGER.md', 'HOSTINGER.md')
    archive.write(root / 'docs' / 'PROFILES.md', 'PROFILES.md')
    archive.write(root / 'docs' / 'GITHUB_ACTIONS.md', 'GITHUB_ACTIONS.md')
print(target)
