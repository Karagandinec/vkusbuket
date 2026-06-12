import os

for root, dirs, files in os.walk(r"c:\Projects\vkusbuket_new"):
    # skip node_modules
    if "node_modules" in dirs:
        dirs.remove("node_modules")
    if ".git" in dirs:
        dirs.remove(".git")
    for f in files:
        if "vercel" in f.lower() or f.endswith(".json"):
            # check if it contains vercel or deployment info
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8") as file:
                    content = file.read()
                    if "vercel" in content.lower():
                        print(f"Found vercel in: {path}")
            except Exception:
                pass
