"""Validate supplied network CSVs and emit a repeatable Flyway import (no DB access).

python tools/import_network.py data/private/network data/private/shared-network.sql
Raw inputs and generated data must remain private (booklet page 22).
Existing rows are never overwritten. This does not import historical plans as live orders.
"""
import csv
import json
import sys
from datetime import date, time
from decimal import Decimal
from pathlib import Path

source, target = map(Path, sys.argv[1:])
def read(name, key):
    with (source / name).open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    keys = [tuple(row[k] for k in key) for row in rows]
    assert len(keys) == len(set(keys)), f'{name}: duplicate primary key'
    assert all(None not in r and all(v is not None for v in r.values()) for r in rows), f'{name}: malformed row'
    return rows

outlets = read('outlets.csv', ['outlet_id'])
vehicles = read('vehicles.csv', ['vehicle_id'])
calendar = read('calendar.csv', ['date'])
districts = read('district_travel.csv', ['district'])
allowances = read('service_allowance.csv', ['brand','dock_type'])
roads = read('road_conditions.csv', ['district','date'])
traffic = read('traffic_speed.csv', ['district','hour','monsoon'])
assert len(outlets) == 120 and len(vehicles) == 60
assert sum(v['temp'] == 'reefer' for v in vehicles) == 16
assert sum(v['type'] == 'van' for v in vehicles) == 8
district_map = {r['district']:r['depot'] for r in districts}
depot_codes = {'Peliyagoda':'PELIYAGODA','Kandy':'KANDY'}
brand_codes = {'Fresh':'FRESH','Style':'STYLE','Tech':'TECH'}
for row in outlets:
    assert row['brand'] in brand_codes and row['depot'] in depot_codes
    assert district_map[row['district']] == row['depot']
    assert row['parking_constraint'] in ('normal','van_only','mall_dock')
    if row['mall_window']:
        start, end = map(time.fromisoformat, row['mall_window'].split('-'))
        assert start <= time.fromisoformat(row['window_open_time']) < time.fromisoformat(row['window_close_time']) <= end
    assert time.fromisoformat(row['window_open_time']) < time.fromisoformat(row['window_close_time'])
for row in vehicles:
    assert row['depot'] in depot_codes and row['type'] in ('truck','van') and row['temp'] in ('reefer','ambient')
    for field in ['weight_cap_kg','volume_cap_m3','km_per_l','weekly_fuel_quota_l']:
        assert Decimal(row[field]) > 0
for row in calendar:
    date.fromisoformat(row['date'])
    assert row['is_operating'] in ('0','1')

def q(value):
    return "'" + str(value).replace("'", "''") + "'"
sql = ["-- Private generated import. Regenerate with tools/import_network.py; never publish source data.",
       "-- Source files contain no names, coordinates or setpoint ranges. Do not invent them."]
for name, rows, keys in [
    ('outlets.csv',outlets,['outlet_id']),('vehicles.csv',vehicles,['vehicle_id']),('calendar.csv',calendar,['date']),
    ('district_travel.csv',districts,['district']),('service_allowance.csv',allowances,['brand','dock_type']),
    ('road_conditions.csv',roads,['district','date']),('traffic_speed.csv',traffic,['district','hour','monsoon'])]:
    # Preserve exact fields and source IDs independently of the operational projection.
    values = [f"({q(name)},{q('|'.join(r[k] for k in keys))},{q(json.dumps(r,separators=(',',':')))}::jsonb)" for r in rows]
    for offset in range(0, len(values), 500):
        sql.append('INSERT INTO source_records VALUES\n' + ',\n'.join(values[offset:offset+500]) + ' ON CONFLICT DO NOTHING;')
for r in outlets:
    # Human-readable derived label; supplied files have IDs rather than outlet names.
    sql.append("INSERT INTO outlets(id,name,brand_code,depot_code,district,access,window_start,window_end,demo,dock_type,mall_window) VALUES(" + ','.join([
        q(r['outlet_id']),q(f"{r['brand']} · {r['district']} · {r['outlet_id']}"),q(brand_codes[r['brand']]),q(depot_codes[r['depot']]),q(r['district']),
        q('VAN_ONLY' if r['parking_constraint']=='van_only' else 'ANY'),q(r['window_open_time']),q(r['window_close_time']),'false',q(r['dock_type']),q(r['mall_window'])]) + ') ON CONFLICT(id) DO NOTHING;')
for r in vehicles:
    identity = 'SOURCE-DRIVER-' + r['vehicle_id']
    sql.append("INSERT INTO accounts(id,username,display_name,password_hash,role,depot_code,demo,enabled) VALUES(" + ','.join([
        q(identity),q(identity.lower()),q('Unprovisioned driver · '+r['vehicle_id']),"crypt(gen_random_uuid()::text,gen_salt('bf',12))",q('DRIVER'),q(depot_codes[r['depot']]),'false','false']) + ') ON CONFLICT(id) DO NOTHING;')
    sql.append("INSERT INTO vehicles(id,name,depot_code,kind,refrigerated,min_c,max_c,weight_kg,volume_m3,weekly_fuel_l,driver_id,available,demo,km_per_l,fuel_type) VALUES(" + ','.join([
        q(r['vehicle_id']),q(f"{r['vehicle_id']} · {r['type']} · {r['temp']}"),q(depot_codes[r['depot']]),q(r['type'].upper()),'true' if r['temp']=='reefer' else 'false',
        'NULL','NULL',r['weight_cap_kg'],r['volume_cap_m3'],r['weekly_fuel_quota_l'],q(identity),'true','false',r['km_per_l'],q(r['fuel_type'])]) + ') ON CONFLICT(id) DO NOTHING;')
values = [f"({q(r['date'])},false)" for r in calendar if r['is_operating']=='1']
sql.append('INSERT INTO operating_days VALUES\n' + ',\n'.join(values) + ' ON CONFLICT DO NOTHING;')
target.write_text('\n'.join(sql)+'\n',encoding='utf-8')
print(f'Validated and generated {target}: {len(outlets)} outlets, {len(vehicles)} vehicles, {len(calendar)} calendar rows; all seven reference files preserved.')
