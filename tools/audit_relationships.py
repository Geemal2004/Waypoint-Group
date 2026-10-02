"""Validate dataset IDs, foreign keys and label joins without copying history into operations."""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

root=Path(sys.argv[1])
def read(folder,name):
    with (root/folder/name).open(encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))
outlets={r['outlet_id']:r for r in read('General Data','outlets.csv')}
vehicles={r['vehicle_id']:r for r in read('General Data','vehicles.csv')}
calendar={r['date']:r for r in read('General Data','calendar.csv')}
report={}
for name,order_file,leg_file,folder in [
    ('training','deliveries_train.csv','route_legs_train.csv','Training Data'),
    ('test','task1_test_inputs.csv','route_legs_test.csv','Test Data')]:
    orders=read(folder,order_file)
    legs=read(folder,leg_file)
    leg_map={}
    duplicates=[]
    for leg in legs:
        key=(leg['route_id'],leg['seq'])
        if key in leg_map: duplicates.append(key)
        leg_map[key]=leg
    errors=[]
    status=Counter()
    for row in orders:
        status[row['dispatch_status']]+=1
        identifier=row['delivery_id']
        if row['outlet_id'] not in outlets: errors.append([identifier,'outlet FK'])
        if row['order_date'] not in calendar: errors.append([identifier,'order calendar FK'])
        outlet=outlets.get(row['outlet_id'],{})
        for field in ['brand','district','depot']:
            if row[field]!=outlet.get(field): errors.append([identifier,field+' mismatch'])
        if row['dispatch_status']=='not_run':
            if row['route_id'] or row['vehicle_id']: errors.append([identifier,'not_run has assignment'])
            continue
        if row['vehicle_id'] not in vehicles: errors.append([identifier,'vehicle FK'])
        leg=leg_map.get((row['route_id'],row['seq_in_route']))
        if not leg: errors.append([identifier,'missing leg join'])
        elif leg['to_outlet']!=row['outlet_id'] or leg['date']!=row['dispatch_date']:
            errors.append([identifier,'leg outlet/date mismatch'])
    id_duplicates=[k for k,v in Counter(r['delivery_id'] for r in orders).items() if v>1]
    report[name]={'orders':len(orders),'legs':len(legs),'statusCounts':dict(status),
                  'duplicateOrderIds':len(id_duplicates),'duplicateLegJoinKeys':len(duplicates),
                  'relationshipErrors':len(errors),'firstErrors':errors[:20]}
print(json.dumps(report,indent=2))
if any(r['relationshipErrors'] or r['duplicateOrderIds'] or r['duplicateLegJoinKeys'] for r in report.values()):
    raise SystemExit(1)
