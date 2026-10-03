package lk.waypoint.core.operations;
import java.time.LocalDate;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import lk.waypoint.core.identity.Account;
@RestController
@RequestMapping("/api/v1/administration")
public class AdministrationController {
 @PostMapping("/{type}/preview") public Map<String,Object> preview(@AuthenticationPrincipal Account a,@PathVariable String type,@RequestBody AdministrationService.ImportBatch q){return admin.preview(a,type,q);}
 @PostMapping("/{type}/import") public Map<String,Object> importRecords(@AuthenticationPrincipal Account a,@PathVariable String type,@RequestBody AdministrationService.ImportBatch q){return admin.importRecords(a,type,q);}
 private final AdministrationService admin;
 public AdministrationController(AdministrationService admin){this.admin=admin;}
 @GetMapping public Map<String,Object> data(@AuthenticationPrincipal Account a){return admin.data(a);}
 @PostMapping("/{type}") public Map<String,Object> change(@AuthenticationPrincipal Account a,@PathVariable String type,@RequestBody AdministrationService.Change q){return admin.change(a,type,q);}
 public record Day(LocalDate day,String reason){}
 public record Scope(String managerId,String outletId,String reason){}
 @PostMapping("/calendar") public Map<String,Object> calendar(@AuthenticationPrincipal Account a,@RequestBody Day q){return admin.calendar(a,q.day(),q.reason());}
 @PostMapping("/scope") public Map<String,Object> scope(@AuthenticationPrincipal Account a,@RequestBody Scope q){return admin.grantOutlet(a,q.managerId(),q.outletId(),q.reason());}
}
