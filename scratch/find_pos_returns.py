import sys

sys.stdout.reconfigure(encoding='utf-8')

app_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\App.js"

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()

# POS starts at line 2417. Let's look for return statement in POS (which starts after 2417 and ends before Preorders at 5345).
# Let's search for lines containing return (
pos_returns = []
for i in range(2416, 5340):
    if "return (" in lines[i] or "return(" in lines[i]:
        pos_returns.append((i + 1, lines[i]))

print("POS return lines:")
for idx, line in pos_returns:
    print(f"Line {idx}: {line}")
