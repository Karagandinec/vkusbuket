import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's search for "collapsed" or "nav" or similar
matches = []
for i, line in enumerate(content.splitlines()):
    if any(kwd in line for kwd in ['collapse', 'Collapse', 'isCollapsed', 'sidebar', 'боковое', 'меню']):
        matches.append((i + 1, line))

print(f"Total keyword matches: {len(matches)}")
for idx, line in matches[:100]:
    print(f"Line {idx}: {line[:120]}")
