import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

# POS is lines 2417 to 5345. Let's look for "selPoint" inside this range.
matches = []
for i in range(2416, 5340):
    if "selPoint" in lines[i]:
        matches.append((i + 1, lines[i]))

print(f"Total 'selPoint' matches in POS: {len(matches)}")
for idx, line in matches:
    print(f"Line {idx}: {line[:120]}")
