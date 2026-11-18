"""Dependency-free loader for tools/blender/mesh_upgrade_config.yaml."""
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mesh_upgrade_config.yaml')


def _parse_scalar(raw):
    val = raw.strip()
    if val in ('true', 'True'):
        return True
    if val in ('false', 'False'):
        return False
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        return val[1:-1]
    if val.startswith('[') and val.endswith(']'):
        inner = val[1:-1].strip()
        return [_parse_scalar(part) for part in inner.split(',')] if inner else []
    try:
        return int(val)
    except ValueError:
        pass
    try:
        return float(val)
    except ValueError:
        return val


def load_upgrade_config(path=CONFIG_PATH):
    """Parse nested YAML key-value sections into a plain Python dict."""
    root = {}
    stack = [(-1, root)]
    if not os.path.exists(path):
        return root
    with open(path, 'r', encoding='utf-8') as f:
        for raw_line in f:
            line = raw_line.split('#', 1)[0].rstrip()
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip(' '))
            stripped = line.strip()
            if ':' not in stripped:
                continue
            key, rest = stripped.split(':', 1)
            key = key.strip()
            rest = rest.strip()
            while len(stack) > 1 and indent <= stack[-1][0]:
                stack.pop()
            parent = stack[-1][1]
            if rest == '':
                child = {}
                parent[key] = child
                stack.append((indent, child))
            else:
                parent[key] = _parse_scalar(rest)
    return root
