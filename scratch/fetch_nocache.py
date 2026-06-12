import requests

headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
}

res = requests.get("https://vkusbuket.vercel.app/?t=1234567890", headers=headers)
if res.ok:
    print("Content:")
    print(res.text)
else:
    print("Error:", res.status_code)
