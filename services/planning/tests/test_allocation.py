from copy import deepcopy
import pytest
from app.allocation import allocate

def fixture():
    orders=[dict(id=str(i),source_ref=f'TEST-{i}',version=0,brand_code='FRESH',district='Test district',temperature='AMBIENT',scenario='TEST',access='ANY',weight_kg=100,volume_m3=1,service_minutes=15,window_start='05:00:00',window_end='08:00:00',deferred_yesterday=False,days_since_last_served=1) for i in range(3)]
    vehicle=dict(id='TEST-VAN',available=True,driver_enabled=True,refrigerated=True,min_c=2,max_c=5,kind='VAN',weight_kg=1000,volume_m3=10,km_per_l=10,weekly_fuel_l=20,reserved_fuel_l=0)
    return dict(day='2026-01-08',version=0,orders=orders,vehicles=[vehicle],trips=[],matrix={'provider':'OSRM','durations':[[0 if i==j else 300 for j in range(4)] for i in range(4)],'distances':[[0 if i==j else 1000 for j in range(4)] for i in range(4)]},fleetStatus=[{'scenario':'TEST','vehicle_id':'TEST-VAN','status':'available'}],districtBudgets=[{'district':'Test district','outbound':20,'inter':5}],loaderId='TEST-LOADER',nextDay='2026-01-09')

def test_whole_orders_form_multi_stop_trip_with_stable_versions():
    result=allocate(fixture())
    assert len(result['trips'])==1
    assert {s['orderId'] for s in result['trips'][0]['stops']}=={'0','1','2'}
    assert result['deferred']==[]

@pytest.mark.parametrize('field,value,reason',[('weight_kg',1,'WEIGHT_LIMIT'),('volume_m3',.1,'VOLUME_LIMIT'),('weekly_fuel_l',.01,'WEEKLY_FUEL'),('available',False,'VEHICLE_UNAVAILABLE')])
def test_infeasible_capacity_and_resources_produce_actionable_deferrals(field,value,reason):
    data=fixture();data['vehicles'][0][field]=value
    result=allocate(data)
    assert result['trips']==[]
    assert len(result['deferred'])==3
    assert all(reason in d['reason'] for d in result['deferred'])

def test_fresh_dry_and_chilled_orders_use_separate_trips():
    data=fixture();data['orders'][0]['temperature']='CHILLED'
    result=allocate(data)
    assert len(result['trips'])==2
    lookup={o['id']:o for o in data['orders']}
    assert all(len({lookup[s['orderId']]['temperature'] for s in t['stops']})==1 for t in result['trips'])

def test_missing_or_unreachable_road_cells_are_rejected():
    data=fixture();data['matrix']['durations'][1][2]=None
    with pytest.raises(ValueError,match='no estimates'):allocate(data)
    data=fixture();data['matrix']['provider']='straight-line'
    with pytest.raises(ValueError):allocate(data)

def test_fixed_window_counts_unloading_and_waiting():
    data=fixture()
    for o in data['orders']:o['window_start']='07:55:00'
    assert len(allocate(data)['deferred'])==3

def test_more_than_two_required_groups_records_deferred_demand():
    data=fixture()
    for i,o in enumerate(data['orders']):o['district']=f'District {i}'
    data['districtBudgets']=[dict(district=o['district'],outbound=20,inter=5) for o in data['orders']]
    result=allocate(data)
    assert len(result['trips'])==2
    assert len(result['deferred'])==1
    assert 'TRIP_LIMIT' in result['deferred'][0]['reason']


def test_new_catalogue_orders_without_source_history_are_allocated_or_deferred():
    data=fixture()
    for order in data['orders']:
        order.update(source_ref=None,scenario=None,days_since_last_served=None,deferred_yesterday=None)
    data['orders'][0]['volume_m3']=100
    result=allocate(data)
    assert any(d['orderId']=='0' and 'VOLUME_LIMIT' in d['reason'] for d in result['deferred'])
    assert {s['orderId'] for t in result['trips'] for s in t['stops']}=={'1','2'}
