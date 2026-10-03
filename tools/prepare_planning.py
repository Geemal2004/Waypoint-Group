"""Private S1 judge import. Source aggregates remain exact; waypoints/cold ranges are supplemental.
Usage: python tools/prepare_planning.py <dataset root> <output.sql> <OSRM base URL>
The simulated day is 2026-01-08, an operating date in the supplied calendar, not a source S1 date.
"""
import csv
import json
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from urllib.request import urlopen

root, output, osrm = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3].rstrip('/')
def rows(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
def q(v):
    return "'" + str(v).replace("'", "''") + "'"
def identity(v):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'waypoint:judge:S1:' + v))

orders = [r for r in rows(root / 'Test Data/task2b_peak_day_scenarios.csv') if r['scenario'] == 'S1']
fleet = [r for r in rows(root / 'Test Data/task2b_peak_day_fleet.csv') if r['scenario'] == 'S1']
outlets = {r['outlet_id']: r for r in rows(root / 'General Data/outlets.csv')}
assert len(orders) == 85 and len({r['order_ref'] for r in orders}) == 85
assert any(r['date'] == '2026-01-08' and r['is_operating'] == '1' for r in rows(root / 'General Data/calendar.csv'))
# District town centres are scenario road waypoints, NEVER claimed to locate the source outlets.
centres = {'Colombo':(79.8612,6.9271),'Gampaha':(80.0144,7.0873),'Kalutara':(79.9607,6.5854),
    'Galle':(80.2210,6.0535),'Matara':(80.5549,5.9549),'Kurunegala':(80.3623,7.4863),'Puttalam':(79.8283,8.0362),
    'Kandy':(80.6337,7.2906),'Matale':(80.6234,7.4675),'Nuwara Eliya':(80.7891,6.9497),
    'Badulla':(81.0550,6.9934),'Ratnapura':(80.3847,6.7056),'Kegalle':(80.3436,7.2523)}
sql = ['-- PRIVATE SOURCE DATA: never commit. Supplemental judge waypoints and 2–5C cold capabilities explicitly authorised.',
       '-- Historical simulation: S1 has no date; 2026-01-08 is an assigned source-calendar operating day.']
points = {'PELIYAGODA':(79.8895,6.9604),'KANDY':centres['Kandy']}
for i, (key,r) in enumerate(outlets.items()):
    lon,lat = centres[r['district']]
    points[key] = (lon + (i%4)*0.0012, lat + ((i//4)%4)*0.0012)
for key,(lon,lat) in points.items():
    with urlopen(f'{osrm}/nearest/v1/driving/{lon},{lat}?number=1', timeout=10) as response:
        data = json.load(response)
    assert data['code'] == 'Ok', f'No road waypoint for {key}'
    snapped = data['waypoints'][0]['location']
    provenance = 'SUPPLEMENTAL JUDGE: district-town road waypoint snapped by local OSRM; not source outlet/depot geolocation'
    sql.append(f'INSERT INTO routing_points(point_id,longitude,latitude,provenance,supplemental) VALUES({q(key)},{snapped[0]},{snapped[1]},{q(provenance)},true) ON CONFLICT DO NOTHING;')
for r in fleet:
    sql.append(f"INSERT INTO scenario_fleet VALUES('S1',{q(r['vehicle_id'])},{q(r['status'])}) ON CONFLICT DO NOTHING;")
    sql.append(f"UPDATE vehicles SET driver_id='DEMO-DRIVER',min_c=CASE WHEN refrigerated THEN 2 ELSE NULL END,max_c=CASE WHEN refrigerated THEN 5 ELSE NULL END,cold_capability_source='SUPPLEMENTAL JUDGE: 2–5C declared capability; shared demo driver for role walkthrough' WHERE id={q(r['vehicle_id'])} AND depot_code='PELIYAGODA';")
for r in orders:
    assert r['depot'] == 'Peliyagoda'
    assert Decimal(r['order_weight_kg'])>0 and Decimal(r['order_volume_m3'])>0 and int(r['order_units'])>0
    src=outlets[r['outlet_id']]
    for key in ['brand','district','dock_type','parking_constraint','window_open_time','window_close_time']:
        assert src[key] == r[key], f'{r["order_ref"]}: source mismatch {key}'
    ref=r['order_ref']; product='JUDGE-'+ref; cold=r['temp_requirement']!='ambient'; units=int(r['order_units'])
    weight=Decimal(r['order_weight_kg'])/units; volume=Decimal(r['order_volume_m3'])/units
    values=[q(product),q(f"{r['brand']} {r['temp_requirement']} source units · {ref}"),q(r['brand'].upper()),q('source unit'),str(weight),str(volume),q(r['temp_requirement'].upper()),'2' if cold else 'NULL','5' if cold else 'NULL',q('Supplemental judge 2–5C cold requirement' if cold else 'Keep dry'),'false']
    sql.append('INSERT INTO products(id,name,brand_code,unit,weight_kg,volume_m3,temperature,min_c,max_c,handling,demo) VALUES('+','.join(values)+') ON CONFLICT DO NOTHING;')
    values=[q(identity(ref)),q(r['outlet_id']),q('DEMO-MANAGER'),q('2026-01-08'),q(r['temp_requirement'].upper()),q('RECEIVED'),'false',q('Source Task 2B S1; assigned historical judge timeline; supplemental road waypoints and cold ranges'),q(ref),q('S1'),r['order_weight_kg'],r['order_volume_m3'],r['days_since_last_served'],'true' if r['deferred_yesterday']=='1' else 'false']
    sql.append('INSERT INTO orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason,source_ref,scenario,source_weight_kg,source_volume_m3,days_since_last_served,deferred_yesterday) VALUES('+','.join(values)+') ON CONFLICT DO NOTHING;')
    sql.append(f"INSERT INTO order_lines(id,order_id,product_id,ordered) VALUES({q(identity(ref+':line'))},{q(identity(ref))},{q(product)},{units}) ON CONFLICT DO NOTHING;")
    sql.append(f"INSERT INTO account_outlets VALUES('DEMO-MANAGER',{q(r['outlet_id'])}) ON CONFLICT DO NOTHING;")
    sql.append(f"INSERT INTO source_records VALUES('task2b_peak_day_scenarios.csv',{q(ref)},{q(json.dumps(r))}::jsonb) ON CONFLICT DO NOTHING;")
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text('\n'.join(sql)+'\n',encoding='utf-8')
print(f'Prepared {len(orders)} source orders, {len(fleet)} source vehicle statuses and {len(points)} labelled supplemental road points in private SQL.')
