package lk.waypoint.core.workflow;

import java.security.MessageDigest;
import java.sql.Timestamp;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lk.waypoint.core.identity.Account;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SyncService {
    public List<Map<String,Object>> actions(Account account) {
        return jdbc.queryForList("select p.action_id,p.outcome,c.state resolution_state,c.resolution_reason from processed_sync_actions p left join sync_conflicts c on c.action_id=p.action_id where p.account_id=? order by p.accepted_at desc",account.id());
    }
    private final JdbcTemplate jdbc;
    private final OperationsService operations;
    private final ObjectMapper json;
    public SyncService(JdbcTemplate jdbc,OperationsService operations,ObjectMapper json) { this.jdbc=jdbc; this.operations=operations; this.json=json; }

    @Transactional(rollbackFor=Exception.class) public Map<String,Object> delivery(Account account,UUID orderId,Contracts.SyncDelivery request,String type,byte[] bytes) throws Exception {
        if(!account.role().equals("DRIVER")) throw new ApiException(403,"ROLE_DENIED","Only the assigned driver can sync delivery proof.");
        // A global action lock also protects reuse across different entities.
        jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",request.actionId().toString());
        // Canonical quantities remove irrelevant line-order differences. Capture time/device/evidence are immutable.
        var sorted=request.delivery().lines().stream().sorted(Comparator.comparing(q -> q.lineId().toString())).toList();
        var canonical=new Contracts.Receive(request.delivery().expectedVersion(),sorted,request.delivery().issue());
        String canonicalJson=json.writeValueAsString(List.of(orderId.toString(),request.deviceId(),request.capturedAt().toString(),canonical,type,HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))));
        String digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonicalJson.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var prior=jdbc.queryForList("select * from processed_sync_actions where action_id=?",request.actionId());
        if(!prior.isEmpty()) {
            var row=prior.getFirst();
            if(!row.get("account_id").equals(account.id())) throw new ApiException(403,"ACTION_SCOPE_DENIED","This action belongs to a different account.");
            if(!row.get("payload_digest").equals(digest)) throw new ApiException(409,"ACTION_ID_REUSED","An action ID cannot be reused with different data or evidence.");
            return json.readValue(row.get("result").toString(),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>() {});
        }
        // Lock current operational truth before deciding acceptance or preserving a conflict.
        jdbc.queryForList("select id from orders where id=? for update",orderId);
        var order=operations.scopedOrder(account,orderId);
        OperationsService.validateImage(type,bytes);
        var result=new LinkedHashMap<String,Object>();
        result.put("actionId",request.actionId());
        String outcome;
        boolean conflict="DEFERRED".equals(order.get("status")) || ((Number)order.get("version")).intValue()!=canonical.expectedVersion();
        if(conflict) {
            outcome="conflict";
            UUID conflictId=UUID.randomUUID();
            result.put("conflictId",conflictId); result.put("message","The same stop changed before proof sync. Evidence retained; dispatcher review required.");
            result.put("currentVersion",order.get("version"));
            result.put("outcome",outcome);
            persist(account,orderId,request,digest,outcome,result);
            jdbc.update("insert into sync_conflicts(id,action_id,order_id,delivery_payload,evidence_type,evidence,captured_at,state) values(?,?,?,cast(? as jsonb),?,?,?,'OPEN')",
                conflictId,request.actionId(),orderId,json.writeValueAsString(canonical),type,bytes,Timestamp.from(request.capturedAt()));
            jdbc.update("insert into audit_events(account_id,order_id,event,details) values(?,?,'OFFLINE_PROOF_CONFLICT','Proof retained; assigned depot dispatcher notified through conflict queue.')",account.id(),orderId);
        } else {
            // Pre-check permanent validation before a transactional service call, which would mark rollback-only on failure.
            var lines=jdbc.queryForList("select id,loaded from order_lines where order_id=?",orderId);
            String rejection=null;
            if(!"ARRIVED".equals(order.get("status"))) rejection="Confirm safely stopped arrival before capturing proof.";
            var supplied=new HashMap<UUID,Integer>();
            for(var q:sorted) if(supplied.put(q.lineId(),q.quantity())!=null) rejection="Repeated order line.";
            if(!supplied.keySet().equals(lines.stream().map(l -> (UUID)l.get("id")).collect(java.util.stream.Collectors.toSet()))) rejection="Proof must contain all and only this order's lines.";
            for(var line:lines) {
                var quantity=supplied.get((UUID)line.get("id"));
                if(quantity==null || line.get("loaded")==null || quantity<0 || quantity>((Number)line.get("loaded")).intValue()) rejection="Delivery quantity exceeds the released load.";
                else if(quantity<((Number)line.get("loaded")).intValue() && canonical.issue().isBlank()) rejection="Explain the delivery shortage.";
            }
            if(rejection!=null) { outcome="rejected"; result.put("message",rejection); }
            else {
                var accepted=operations.deliver(account,orderId,canonical,request.capturedAt(),type,bytes);
                outcome="accepted"; result.put("orderId",orderId); result.put("version",accepted.get("version")); result.put("message","Proof accepted; manager receipt task is ready.");
            }
            result.put("outcome",outcome); persist(account,orderId,request,digest,outcome,result);
        }
        return result;
    }
    private void persist(Account account,UUID id,Contracts.SyncDelivery request,String digest,String outcome,Map<String,Object> result) throws Exception {
        jdbc.update("insert into processed_sync_actions(action_id,account_id,device_id,order_id,expected_version,payload_digest,captured_at,outcome,result) values(?,?,?,?,?,?,?,?,cast(? as jsonb))",request.actionId(),account.id(),request.deviceId(),id,request.delivery().expectedVersion(),digest,Timestamp.from(request.capturedAt()),outcome,json.writeValueAsString(result));
    }
    public List<Map<String,Object>> conflicts(Account account) {
        dispatcher(account);
        return jdbc.queryForList("select c.id,c.action_id,c.order_id,c.captured_at,c.accepted_at,c.state,c.resolution_reason,c.resolved_at,o.status current_status,o.version current_version,t.name outlet_name from sync_conflicts c join orders o on o.id=c.order_id join outlets t on t.id=o.outlet_id where t.depot_code=? order by c.accepted_at desc",account.depot());
    }
    public Map<String,Object> evidence(Account account,UUID conflictId) {
        dispatcher(account);
        var conflict=jdbc.queryForList("select c.* from sync_conflicts c join orders o on o.id=c.order_id join outlets t on t.id=o.outlet_id where c.id=? and t.depot_code=?",conflictId,account.depot());
        if(conflict.isEmpty()) throw new ApiException(404,"CONFLICT_NOT_FOUND","Conflict not found in your depot.");
        return conflict.getFirst();
    }
    @Transactional(rollbackFor=Exception.class) public Map<String,Object> resolve(Account account,UUID conflictId,Contracts.ResolveConflict request) throws Exception {
        dispatcher(account);
        // Same order-first lock ordering as delivery sync avoids cross-transaction deadlocks.
        var before=evidence(account,conflictId); UUID id=(UUID)before.get("order_id");
        jdbc.queryForList("select id from orders where id=? for update",id);
        var conflict=evidence(account,conflictId);
        if(!"OPEN".equals(conflict.get("state"))) throw new ApiException(409,"CONFLICT_RESOLVED","This conflict has already been resolved.");
        var order=operations.scopedOrder(account,id);
        if(((Number)order.get("version")).intValue()!=request.expectedVersion()) throw new ApiException(409,"STALE_VERSION","Reload the latest order before resolving.");
        if(request.acceptDelivery()) {
            var delivery=json.readValue(conflict.get("delivery_payload").toString(),Contracts.Receive.class);
            operations.acceptRecoveredProof(account,id,request.expectedVersion(),delivery,(String)conflict.get("evidence_type"),(byte[])conflict.get("evidence"),((Timestamp)conflict.get("captured_at")).toInstant());
        }
        String state=request.acceptDelivery()?"ACCEPTED":"REJECTED";
        jdbc.update("update sync_conflicts set state=?,resolved_by=?,resolution_reason=?,resolved_at=now() where id=?",state,account.id(),request.reason(),conflictId);
        jdbc.update("insert into audit_events(account_id,order_id,event,details) values(?,?,'SYNC_CONFLICT_RESOLVED',?)",account.id(),id,state+" · "+request.reason());
        // Original action result remains immutable for duplicate retries; resolution is queried separately.
        return Map.of("conflictId",conflictId,"state",state,"evidenceRetained",true,"order",operations.detail(account,id));
    }
    private static void dispatcher(Account a) { if(!a.role().equals("DISPATCHER")) throw new ApiException(403,"ROLE_DENIED","Dispatcher review required."); }
}
