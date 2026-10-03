"""Deterministic assisted insertion. Proposals are never authoritative assignments.
All timing and fuel inputs are OSRM road matrices supplied by Spring. No fallback estimates.
"""
from datetime import datetime, timedelta, timezone
from math import isfinite, ceil

ZONE = timezone(timedelta(hours=5, minutes=30))
def allocate(data):
    orders, vehicles, matrix = data['orders'], data['vehicles'], data['matrix']
    durations, distances = matrix['durations'], matrix['distances']
    size = len(orders)+1
    if matrix.get('provider') != 'OSRM' or any(len(rows)!=size or any(len(row)!=size or any(not isinstance(v,(int,float)) or not isfinite(v) or v<0 for v in row) for row in rows) for rows in [durations,distances]):
        raise ValueError('A complete reachable OSRM road matrix is required; no estimates are accepted.')
    day=data['day']; indexed={o['id']:i+1 for i,o in enumerate(orders)}
    fleet={(r['scenario'],r['vehicle_id']):r['status'] for r in data['fleetStatus']}
    budgets={r['district']:r for r in data['districtBudgets']}
    existing=data['trips']; proposed=[]; deferred=[]
    def at(time): return datetime.fromisoformat(day+'T'+time).replace(tzinfo=ZONE)
    def road(stops,start):
        cursor=start;previous=0;metres=0
        for o in stops:
            index=indexed[o['id']]
            # Two seconds per leg are an explicit rounding margin, never a replacement road metric.
            cursor+=timedelta(seconds=ceil(durations[previous][index])+2);metres+=distances[previous][index]
            cursor=max(cursor,at(o['window_start']))+timedelta(minutes=o['service_minutes'])
            if cursor>at(o['window_end']) or (o['brand_code']=='FRESH' and cursor>at('08:00:00')):
                return None,'DELIVERY_WINDOW: travel, waiting and service do not fit the source window'
            previous=index
        return (cursor+timedelta(seconds=ceil(durations[previous][0])+2),(metres+distances[previous][0])/1000),''
    def feasible(v,stops,slot,start,replacing=None):
        first=stops[0]
        if not v['available'] or not v['driver_enabled']:return None,'VEHICLE_UNAVAILABLE: provision an available vehicle and driver'
        if any(o.get('scenario') and fleet.get((o['scenario'],v['id']))!='available' for o in stops):return None,'SCENARIO_FLEET: vehicle is in workshop or outside the source fleet'
        if any(o['brand_code']!=first['brand_code'] or o['district']!=first['district'] for o in stops):return None,'BRAND_DISTRICT: use a separate same-brand, same-district trip'
        if any(o['temperature']!=first['temperature'] for o in stops):return None,'SEPARATE_TEMPERATURE_LOADS: dry and chilled orders need separate trips'
        if v['refrigerated'] and first['brand_code']!='FRESH' and data.get('freshOnlyReefers',True):return None,'FRESH_ONLY_POLICY: select ambient fleet for Style or Tech'
        if first['temperature']!='AMBIENT' and (not v['refrigerated'] or v['min_c'] is None or v['max_c'] is None or v['min_c']>5 or v['max_c']<2):return None,'TEMPERATURE_RANGE: select declared compatible 2–5C refrigerated fleet'
        if any(o['access']=='VAN_ONLY' for o in stops) and v['kind']!='VAN':return None,'VAN_ONLY_ACCESS: select a van'
        if sum(o['weight_kg'] for o in stops)>v['weight_kg']:return None,'WEIGHT_LIMIT: whole-order demand exceeds available kg capacity'
        if sum(o['volume_m3'] for o in stops)>v['volume_m3']:return None,'VOLUME_LIMIT: whole-order demand exceeds available cubic-metre capacity'
        route,reason=road(stops,start)
        if not route:return None,reason
        end,km=route
        if end.date().isoformat()!=day:return None,'RETURN_DAY: depot return exceeds operating day'
        if not v.get('km_per_l'):return None,'FUEL_UNITS: source km/L required'
        fuel=km/v['km_per_l'];b=budgets[first['district']]
        budget=b['outbound']+b['inter']*(len(stops)-1)+sum(o['service_minutes'] for o in stops)
        others=[t for t in proposed if t is not replacing and t['vehicleId']==v['id']]
        reserved=[t for t in existing if t['vehicle_id']==v['id']]
        daily=[(t['trip'],t['_start'],t['_end'],t['_budget'],t['_brand']) for t in others]
        daily += [(t['trip'],datetime.fromisoformat(t['departure_at']),datetime.fromisoformat(t['return_at']),t['booklet_minutes'],t['brand_code']) for t in reserved]
        if len(daily)>=2 or any(t[0]==slot for t in daily):return None,'TRIP_LIMIT: both daily route slots are reserved'
        daily.append((slot,start,end,budget,first['brand_code']));daily.sort()
        if any(daily[i][1]<daily[i-1][2]+timedelta(minutes=data.get('turnaroundMinutes',30)) for i in range(1,len(daily))):return None,'TRIP_TURNAROUND: allow return and depot reload before the next trip'
        if sum(t[3] for t in daily if t[4]=='FRESH')>270 or sum(t[3] for t in daily if t[4]!='FRESH')>480:return None,'TRIP_BUDGET: daily audited brand budget exhausted'
        if v['reserved_fuel_l']+sum(t['_fuel'] for t in others)+fuel>v['weekly_fuel_l']:return None,'WEEKLY_FUEL: weekly litre allowance exhausted'
        return {'_start':start,'_end':end,'_fuel':fuel,'_budget':budget,'_brand':first['brand_code']},''
    priority=sorted(orders,key=lambda o:(not o.get('deferred_yesterday'),-o.get('days_since_last_served',0),o['window_end'],o.get('source_ref') or o['id']))
    for order in priority:
        selected=None;best=None;reasons=[]
        for v in vehicles:
            for trip in [t for t in proposed if t['vehicleId']==v['id']]:
                for position in range(len(trip['_orders'])+1):
                    stops=trip['_orders'][:position]+[order]+trip['_orders'][position:]
                    result,reason=feasible(v,stops,trip['trip'],trip['_start'],trip)
                    if result:
                        cost=(0,result['_fuel']-trip['_fuel'],v['id'],position)
                        if best is None or cost<best:best=cost;selected=(trip,v,stops,result)
                    else:reasons.append(reason)
            for slot in [1,2]:
                start=at('03:30:00' if order['brand_code']=='FRESH' else '09:00:00')
                previous=[t['_end'] for t in proposed if t['vehicleId']==v['id'] and t['trip']<slot]
                previous += [datetime.fromisoformat(t['return_at']) for t in existing if t['vehicle_id']==v['id'] and t['trip']<slot]
                if previous:start=max(start,max(previous)+timedelta(minutes=data.get('turnaroundMinutes',30)))
                result,reason=feasible(v,[order],slot,start)
                if result:
                    cost=(1,result['_fuel'],v['id'],slot)
                    if best is None or cost<best:best=cost;selected=(None,v,[order],result|{'trip':slot})
                else:reasons.append(reason)
        if selected:
            trip,v,stops,result=selected
            if trip is None:
                trip={'existingTripId':None,'vehicleId':v['id'],'trip':result.pop('trip'),'loaderId':data['loaderId']};proposed.append(trip)
            trip.update(result);trip['_orders']=stops
        else:
            # Capacity impossibility is actionable even when other vehicles were disqualified by policy.
            eligible=[v for v in vehicles if v['available'] and v['driver_enabled'] and (not v['refrigerated'] or order['brand_code']=='FRESH')]
            reason='; '.join(dict.fromkeys(reasons))[:500]
            if eligible and order['volume_m3']>max(v['volume_m3'] for v in eligible):reason='VOLUME_LIMIT: whole order exceeds every eligible vehicle; arrange additional capacity or agree a later order revision'
            deferred.append({'orderId':order['id'],'expectedVersion':order['version'],'reason':reason or 'NO_FEASIBLE_SLOT: adjust fleet, timing or demand','nextDay':data['nextDay']})
    return {'day':day,'expectedPlanVersion':data['version'],'reason':'Assisted whole-order road-matrix insertion; Spring independently validates before publication.',
        'trips':[{'existingTripId':t['existingTripId'],'vehicleId':t['vehicleId'],'trip':t['trip'],'loaderId':t['loaderId'],'departureAt':t['_start'].astimezone(timezone.utc).isoformat(),'stops':[{'orderId':o['id'],'expectedVersion':o['version']} for o in t['_orders']]} for t in proposed], 'deferred':deferred}
