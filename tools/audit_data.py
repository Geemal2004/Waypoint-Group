"""Read-only challenge CSV audit; no source values are silently assigned units."""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1])
report = []
for path in sorted(root.rglob('*.csv')):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames
        nulls = Counter()
        rows = 0
        malformed = []
        samples = []
        duplicates = 0
        seen = set()
        bounds = {}
        for row in reader:
            rows += 1
            if None in row or any(v is None for v in row.values()):
                malformed.append(rows + 1)
            for key, value in row.items():
                if not value:
                    nulls[str(key)] += 1
                if value and key and ('date' in key or key.endswith('_id') or key in ('brand', 'depot', 'district', 'temperature', 'access_type')):
                    lo, hi = bounds.get(key, (value, value))
                    bounds[key] = (min(lo, value), max(hi, value))
            signature = tuple(str(row.get(h)) for h in headers)
            if signature in seen:
                duplicates += 1
            seen.add(signature)
            if len(samples) < 2:
                samples.append(row)
        report.append(dict(file=str(path.relative_to(root)), sha256=digest, headers=headers, rows=rows,
                           blankFields=dict(nulls), malformedRows=malformed[:30], exactDuplicateRows=duplicates,
                           lexicalBounds=bounds, samples=samples))
print(json.dumps(report, indent=2))
