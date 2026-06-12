import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

matches = []
for i, line in enumerate(lines):
    if "preorders" in line.lower():
        matches.append((i + 1, line))

print(f"Total 'preorders' matches: {len(matches)}")
for idx, line in matches:
    print(f"Line {idx}: {line[:140]}")
