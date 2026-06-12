import requests

res = requests.head("https://vkusbuket.vercel.app/static/js/main.389116e6.js")
for k, v in res.headers.items():
    print(f"{k}: {v}")
