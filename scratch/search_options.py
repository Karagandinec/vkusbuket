import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\user\.gemini\antigravity\brain\4aa16437-4918-488d-8f03-4efcaae930e5\.system_generated\logs\transcript.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        content = data.get('content', '')
        if not content:
            continue
        if any(keyword in content for keyword in ['Safari', 'Capacitor', 'PWA', 'iOS', 'Android', 'Windows', 'вариант 3', 'Вариант 3']):
            print(f"--- STEP {i} ({data.get('source')} - {data.get('type')}) ---")
            print(content)
            print("-" * 50)
