import requests
import time

files = {'file': ('dummy.mkv', b'\x00'*1024*1024*2, 'video/x-matroska')}
res = requests.post('http://127.0.0.1:8001/api/proxy/convert', files=files)
if res.status_code != 200:
    print("Failed to start:", res.text)
    exit(1)

task_id = res.json().get('task_id')
print("Started task:", task_id)

while True:
    st = requests.get(f'http://127.0.0.1:8001/api/proxy/status/{task_id}').json()
    print(st)
    if st['status'] in ['done', 'error']:
        break
    time.sleep(1)
