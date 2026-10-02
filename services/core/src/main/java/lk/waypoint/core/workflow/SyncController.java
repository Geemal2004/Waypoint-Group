package lk.waypoint.core.workflow;

import java.util.*;
import jakarta.validation.Valid;
import lk.waypoint.core.identity.Account;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class SyncController {
    private final SyncService sync;
    public SyncController(SyncService sync) { this.sync=sync; }
    @GetMapping("/sync-actions") public List<Map<String,Object>> actions(@AuthenticationPrincipal Account a) { return sync.actions(a); }
    @PostMapping(value="/orders/{id}/sync-delivery",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String,Object> delivery(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestPart("action") Contracts.SyncDelivery action,@RequestPart("proof") MultipartFile proof) throws Exception {
        return sync.delivery(a,id,action,proof.getContentType()==null?"":proof.getContentType(),proof.getBytes());
    }
    @GetMapping("/sync-conflicts") public List<Map<String,Object>> conflicts(@AuthenticationPrincipal Account a) { return sync.conflicts(a); }
    @PostMapping("/sync-conflicts/{id}/resolve") public Map<String,Object> resolve(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.ResolveConflict q) throws Exception { return sync.resolve(a,id,q); }
    @GetMapping("/sync-conflicts/{id}/evidence") public ResponseEntity<byte[]> evidence(@AuthenticationPrincipal Account a,@PathVariable UUID id) {
        var e=sync.evidence(a,id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String)e.get("evidence_type"))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body((byte[])e.get("evidence"));
    }
}
