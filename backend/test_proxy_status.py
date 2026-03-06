import requests

r = requests.get('http://127.0.0.1:8001/api/proxy/status/b57ca152-5297-401f-952b-9033bf44e98a')
print(r.json())
