package lk.waypoint.core.planning;
import java.time.LocalDate;
import java.util.Map;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import lk.waypoint.core.identity.Account;
@RestController
@RequestMapping("/api/v1/planning")
public class PlanningController {
    private final PlanningService service;
    public PlanningController(PlanningService service){this.service=service;}
    @GetMapping public Map<String,Object> context(@AuthenticationPrincipal Account a,@RequestParam LocalDate day){return service.context(a,day);}
    @PostMapping("/propose") public Map<String,Object> propose(@AuthenticationPrincipal Account a,@Valid @RequestBody PlanningContracts.Propose p){return service.propose(a,p);}
    @PostMapping("/validate") public Map<String,Object> validate(@AuthenticationPrincipal Account a,@Valid @RequestBody PlanningContracts.Plan p){return service.validate(a,p);}
    @PostMapping("/publish") public Map<String,Object> publish(@AuthenticationPrincipal Account a,@Valid @RequestBody PlanningContracts.Plan p){return service.publish(a,p);}
}
