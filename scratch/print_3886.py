import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\user\.gemini\antigravity\brain\4aa16437-4918-488d-8f03-4efcaae930e5\.system_generated\logs\transcript.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        if i == 3886:
            print(data.get('content'))
            break
