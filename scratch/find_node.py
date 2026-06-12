import os

paths_to_search = [
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    r"C:\Users\user\AppData\Local",
    r"C:\Users\user\AppData\Roaming"
]

found = []
for p in paths_to_search:
    if not os.path.exists(p):
        continue
    print("Searching in", p)
    for root, dirs, files in os.walk(p):
        # limit depth to avoid long searches
        depth = root.count(os.sep) - p.count(os.sep)
        if depth > 4:
            dirs.clear() # don't go deeper
            continue
        if "node.exe" in files:
            found.append(os.path.join(root, "node.exe"))
        if "npm.cmd" in files:
            found.append(os.path.join(root, "npm.cmd"))

print("Found node/npm:")
for f in found:
    print("  ", f)
