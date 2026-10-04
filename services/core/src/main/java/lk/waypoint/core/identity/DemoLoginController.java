package lk.waypoint.core.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Judge environments only: one-click sign-in to the seeded demo accounts, never to operational accounts. */
@RestController
@ConditionalOnProperty(name="waypoint.demo-seed", havingValue="true")
public class DemoLoginController {
    private static final List<String> ROLES = List.of("MANAGER","DISPATCHER","LOADER","DRIVER");
    private final JdbcTemplate jdbc;
    private final UserDetailsService users;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    public DemoLoginController(JdbcTemplate jdbc, UserDetailsService users) { this.jdbc = jdbc; this.users = users; }

    @GetMapping("/api/v1/auth/demo-accounts") public List<String> accounts() {
        return jdbc.queryForList("select role from accounts where demo and enabled and id = 'DEMO-' || role", String.class)
            .stream().filter(ROLES::contains).sorted((a,b) -> ROLES.indexOf(a) - ROLES.indexOf(b)).toList();
    }

    @PostMapping("/api/v1/auth/demo-login") public ResponseEntity<Map<String,Object>> login(@RequestBody Map<String,String> body, HttpServletRequest request, HttpServletResponse response) {
        String role = body == null ? null : body.get("role");
        var username = ROLES.contains(role)
            ? jdbc.queryForList("select username from accounts where id=? and demo and enabled", String.class, "DEMO-" + role).stream().findFirst()
            : java.util.Optional.<String>empty();
        if (username.isEmpty())
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("code","DEMO_ACCOUNT_UNAVAILABLE","message","This demo role is not available."));
        var account = (Account) users.loadUserByUsername(username.get());
        if (request.getSession(false) != null) request.changeSessionId(); else request.getSession(true);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account, null, account.getAuthorities()));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return ResponseEntity.ok(Map.of("authenticated", true));
    }
}
