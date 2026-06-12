import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

for i, line in enumerate(lines):
    if 'id:"pos"' in line or 'id: "pos"' in line or 'id:\'pos\'' in line or 'id: \'pos\'' in line:
        print(f"Line {i+1}: {line}")
