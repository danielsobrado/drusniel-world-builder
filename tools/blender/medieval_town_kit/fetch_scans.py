"""Downloads Poly Haven (CC0) surfaces into assets-src/medieval-town-kit/scans/<id>/ as the
1K colour (albedo.jpg) and OpenGL normal (normal.jpg) that medkit/scans.py loads.

    python tools/blender/medieval_town_kit/fetch_scans.py dark_rock_02 stone_tiles_02 ...

Credit new assets in THIRD_PARTY_NOTICES.md.
"""
import json
import os
import sys
import urllib.request

SCAN_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'assets-src', 'medieval-town-kit', 'scans')
MAPS = {'albedo.jpg': 'Diffuse', 'normal.jpg': 'nor_gl'}


def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'medkit'})) as r:
        return r.read()


def fetch(asset):
    files = json.loads(_get(f'https://api.polyhaven.com/files/{asset}'))
    out = os.path.normpath(os.path.join(SCAN_DIR, asset))
    os.makedirs(out, exist_ok=True)
    for name, key in MAPS.items():
        url = files[key]['1k']['jpg']['url']
        with open(os.path.join(out, name), 'wb') as f:
            f.write(_get(url))
        print(f'{asset}/{name} <- {url}')


if __name__ == '__main__':
    for asset_id in sys.argv[1:]:
        fetch(asset_id)
