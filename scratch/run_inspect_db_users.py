import os
import sys
import requests

sys.stdout.reconfigure(encoding='utf-8')

env_path = r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\.env"
supabase_url = None
supabase_key = None

if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("REACT_APP_SUPABASE_URL="):
                supabase_url = line.split("=")[1].strip()
            elif line.startswith("REACT_APP_SUPABASE_KEY="):
                supabase_key = line.split("=")[1].strip()

headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}

res = requests.get(f"{supabase_url}/rest/v1/app_users", headers=headers)
if res.ok:
    users = res.json()
    print("Users in database:")
    for u in users:
        print(f"  ID: {u['id']} | Name: {u['name']} | Role: {u['role']} | Pin: {u['pin']} | Point: {u['point']}")
else:
    print("Error:", res.text)
