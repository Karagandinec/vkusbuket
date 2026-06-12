import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

# Search for "Оформить предзаказ" in App.js
matches = []
for i, line in enumerate(lines):
    if "Оформить предзаказ" in line or "preorder" in line:
        matches.append((i + 1, line))

print("Matches:")
for idx, line in matches[:100]:
    print(f"Line {idx}: {line[:120]}")
