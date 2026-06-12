import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

# Search for isMobile definition or usage
matches = []
for i, line in enumerate(lines):
    if "isMobile" in line:
        matches.append((i + 1, line))

print(f"Total isMobile matches: {len(matches)}")
for idx, line in matches[:50]:
    print(f"Line {idx}: {line[:120]}")
