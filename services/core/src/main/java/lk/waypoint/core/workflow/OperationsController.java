package lk.waypoint.core.workflow;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import lk.waypoint.core.identity.Account;

@RestController
@RequestMapping("/api/v1")
public class OperationsController {
    private final OperationsService operations;
    public OperationsController(OperationsService operations) { this.operations=operations; }
    @GetMapping("/catalog") public Map<String,Object> catalog(@AuthenticationPrincipal Account a) { return operations.catalog(a); }
    @GetMapping("/vehicles") public List<Map<String,Object>> vehicles(@AuthenticationPrincipal Account a) { return operations.vehicles(a); }
    @GetMapping("/orders") public List<Map<String,Object>> orders(@AuthenticationPrincipal Account a) { return operations.orders(a); }
    @GetMapping("/orders/{id}") public Map<String,Object> order(@AuthenticationPrincipal Account a,@PathVariable UUID id) { return operations.detail(a,id); }
    @PostMapping("/orders") @ResponseStatus(HttpStatus.CREATED) public Map<String,Object> create(@AuthenticationPrincipal Account a,@Valid @RequestBody Contracts.CreateOrder q) { return operations.create(a,q); }
    @PostMapping("/orders/{id}/publish") public Map<String,Object> publish(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Publish q) { return operations.publish(a,id,q); }
    @PostMapping("/orders/{id}/loading") public Map<String,Object> loading(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Quantities q) { return operations.loading(a,id,q); }
    @PostMapping("/orders/{id}/approve-partial") public Map<String,Object> approve(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Approval q) { return operations.approvePartial(a,id,q); }
    @PostMapping("/orders/{id}/release") public Map<String,Object> release(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Version q) { return operations.release(a,id,q.expectedVersion()); }
    @PostMapping("/orders/{id}/start") public Map<String,Object> start(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Version q) { return operations.start(a,id,q.expectedVersion()); }
    @PostMapping("/orders/{id}/arrive") public Map<String,Object> arrive(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Version q) { return operations.arrive(a,id,q.expectedVersion()); }
    @PostMapping(value="/orders/{id}/deliver",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public Map<String,Object> deliver(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestPart("delivery") Contracts.Receive q,@RequestPart("proof") MultipartFile proof,@RequestParam Instant capturedAt) throws IOException {
        return operations.deliver(a,id,q,capturedAt,proof.getContentType()==null?"":proof.getContentType(),proof.getBytes());
    }
    @PostMapping("/orders/{id}/receive") public Map<String,Object> receive(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Receive q) { return operations.receive(a,id,q); }
    @PostMapping("/orders/{id}/defer") public Map<String,Object> defer(@AuthenticationPrincipal Account a,@PathVariable UUID id,@Valid @RequestBody Contracts.Defer q) { return operations.defer(a,id,q); }
    @GetMapping("/orders/{id}/proof") public ResponseEntity<byte[]> proof(@AuthenticationPrincipal Account a,@PathVariable UUID id) {
        var proof=operations.proof(a,id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String)proof.get("content_type"))).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body((byte[])proof.get("bytes"));
    }
}
