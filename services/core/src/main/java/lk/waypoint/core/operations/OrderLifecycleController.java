package lk.waypoint.core.operations;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.Contracts;

@RestController
@RequestMapping("/api/v1")
public class OrderLifecycleController {
 private final OrderLifecycleService orders;
 public OrderLifecycleController(OrderLifecycleService orders){this.orders=orders;}
 @GetMapping("/drafts") public List<Map<String,Object>> drafts(@AuthenticationPrincipal Account a){return orders.drafts(a);}
 @PostMapping("/drafts") public Map<String,Object> save(@AuthenticationPrincipal Account a,@RequestBody OrderLifecycleService.Draft q){return orders.saveDraft(a,q);}
 @PostMapping("/drafts/{id}/submit") public Map<String,Object> submit(@AuthenticationPrincipal Account a,@PathVariable UUID id,@RequestBody Contracts.Version q){return orders.submit(a,id,q.expectedVersion());}
 @PostMapping("/orders/{id}/commands") public Map<String,Object> command(@AuthenticationPrincipal Account a,@PathVariable UUID id,@RequestBody OrderLifecycleService.Command q){return orders.command(a,id,q);}
}
