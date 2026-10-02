package lk.waypoint.core.identity;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class IdentityController {
    @GetMapping("/api/v1/auth/csrf") public Map<String,String> csrf(CsrfToken token) { return Map.of("token",token.getToken(),"headerName",token.getHeaderName()); }
    @GetMapping("/api/v1/auth/me") public Map<String,String> me(@AuthenticationPrincipal Account account) {
        return Map.of("id",account.id(),"username",account.username(),"name",account.displayName(),"role",account.role(),"depot",account.depot());
    }
}
