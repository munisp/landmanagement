from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TODO = ROOT / 'todo.md'
OUT_JSON = ROOT / 'remaining_todo_analysis.json'
OUT_MD = ROOT / 'remaining_todo_analysis_summary.md'

heading_re = re.compile(r'^(#{2,6})\s+(.*)$')
item_re = re.compile(r'^- \[ \] (.*)$')

lines = TODO.read_text(encoding='utf-8').splitlines()
current_headings: list[dict[str, object]] = []
rows: list[dict[str, object]] = []

for lineno, line in enumerate(lines, start=1):
    heading_match = heading_re.match(line.strip())
    if heading_match:
        level = len(heading_match.group(1))
        title = heading_match.group(2).strip()
        while current_headings and int(current_headings[-1]['level']) >= level:
            current_headings.pop()
        current_headings.append({'level': level, 'title': title, 'line': lineno})
        continue

    item_match = item_re.match(line.strip())
    if item_match:
        item = item_match.group(1).strip()
        h2 = next((h['title'] for h in reversed(current_headings) if h['level'] == 3), None)
        h1 = next((h['title'] for h in reversed(current_headings) if h['level'] == 2), None)
        parent = current_headings[-1]['title'] if current_headings else None
        rows.append({
            'line': lineno,
            'item': item,
            'section_h2': h1,
            'section_h3': h2,
            'nearest_heading': parent,
        })

by_section = defaultdict(list)
for row in rows:
    key = row['section_h2'] or row['nearest_heading'] or 'Unsectioned'
    by_section[key].append(row)

summary = {
    'total_unchecked': len(rows),
    'sections': [
        {
            'section': section,
            'count': len(items),
            'sample_items': [x['item'] for x in items[:10]],
        }
        for section, items in sorted(by_section.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    ],
    'items': rows,
}

OUT_JSON.write_text(json.dumps(summary, indent=2), encoding='utf-8')

md_lines = [
    '# Remaining TODO Analysis Summary',
    '',
    f"Total unchecked items: **{len(rows)}**",
    '',
    '| Section | Count | Sample items |',
    '|---|---:|---|',
]
for section_info in summary['sections']:
    sample = '; '.join(section_info['sample_items'][:3])
    md_lines.append(f"| {section_info['section']} | {section_info['count']} | {sample} |")

OUT_MD.write_text('\n'.join(md_lines) + '\n', encoding='utf-8')
print(f'Wrote {OUT_JSON}')
print(f'Wrote {OUT_MD}')
