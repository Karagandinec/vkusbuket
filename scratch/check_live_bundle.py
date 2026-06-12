import requests

res = requests.get("https://vkusbuket.vercel.app/static/js/main.389116e6.js")
if res.ok:
    js_content = res.text
    print("Bundle length:", len(js_content))
    print("Contains 'preorders':", "preorders" in js_content)
    print("Contains 'Оформить предзаказ':", "Оформить предзаказ" in js_content.lower())
    print("Contains 'preorderClientPhone':", "preorderClientPhone" in js_content)
    print("Contains 'serviceWorkerRegistration':", "serviceWorkerRegistration" in js_content)
else:
    print("Error:", res.status_code)
