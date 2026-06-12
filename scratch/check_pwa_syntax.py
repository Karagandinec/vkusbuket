import os
import sys

def check_file(path):
    print(f"Checking {os.path.basename(path)}...")
    if not os.path.exists(path):
        print(f"  File does not exist: {path}")
        return False
        
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        
    braces = 0
    brackets = 0
    parens = 0
    in_string = False
    string_char = None
    escaped = False
    in_comment = False
    comment_type = None
    
    idx = 0
    n = len(content)
    while idx < n:
        char = content[idx]
        
        if in_comment:
            if comment_type == "single" and char == '\n':
                in_comment = False
            elif comment_type == "multi" and char == '*' and idx + 1 < n and content[idx+1] == '/':
                in_comment = False
                idx += 1
            idx += 1
            continue
            
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == string_char:
                in_string = False
                string_char = None
            idx += 1
            continue
            
        if char == '/' and idx + 1 < n:
            if content[idx+1] == '/':
                in_comment = True
                comment_type = "single"
                idx += 2
                continue
            elif content[idx+1] == '*':
                in_comment = True
                comment_type = "multi"
                idx += 2
                continue
                
        if char in ['"', "'", '`']:
            in_string = True
            string_char = char
            idx += 1
            continue
            
        if char == '{':
            braces += 1
        elif char == '}':
            braces -= 1
        elif char == '[':
            brackets += 1
        elif char == ']':
            brackets -= 1
        elif char == '(':
            parens += 1
        elif char == ')':
            parens -= 1
            
        if braces < 0 or brackets < 0 or parens < 0:
            print(f"  Unbalanced at char {idx} (Line {len(content[:idx].splitlines()) + 1}): braces={braces}, brackets={brackets}, parens={parens}")
            return False
            
        idx += 1
        
    if braces == 0 and brackets == 0 and parens == 0:
        print("  Success! All brackets are balanced.")
        return True
    else:
        print(f"  Unbalanced end: braces={braces}, brackets={brackets}, parens={parens}")
        return False

# Files to check
files = [
    r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\index.js",
    r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\src\serviceWorkerRegistration.js",
    r"c:\Projects\vkusbuket_new\vkusbuket\vkusweb\public\service-worker.js"
]

all_ok = True
for f in files:
    if not check_file(f):
        all_ok = False

if all_ok:
    print("All files look perfect!")
    sys.exit(0)
else:
    print("Some errors found!")
    sys.exit(1)
