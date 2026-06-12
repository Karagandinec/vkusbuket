import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\user\.gemini\antigravity\brain\4aa16437-4918-488d-8f03-4efcaae930e5\.system_generated\logs\transcript.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        # We only want to find steps in the range where options were discussed
        # Let's search for 'Вариант 1' or 'вариант 1'
        data = json.loads(line)
        content = data.get('content', '')
        if not content:
            continue
        if 'Вариант 1' in content or 'Вариант 2' in content or 'Вариант 3' in content or 'переход к нативным' in content:
            print(f"--- STEP {i} ({data.get('source')} - {data.get('type')}) ---")
            print(content[:1500])
            print("...\n" if len(content) > 1500 else "\n")
            print("-" * 50)
