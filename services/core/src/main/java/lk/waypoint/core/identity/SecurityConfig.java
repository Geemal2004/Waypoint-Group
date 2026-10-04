package lk.waypoint.core.identity;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean UserDetailsService users(JdbcTemplate jdbc) {
        return username -> jdbc.query("select * from accounts where username=?", (r,i) -> new Account(r.getString("id"),r.getString("username"),r.getString("display_name"),r.getString("password_hash"),r.getString("role"),r.getString("depot_code"),r.getBoolean("enabled")), username)
            .stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
    }
    @Bean SecurityFilterChain security(HttpSecurity http,JdbcTemplate jdbc) throws Exception {
        // Session-backed CSRF token is returned by /auth/csrf (including after login).
        http.authorizeHttpRequests(a -> a.requestMatchers("/actuator/health", "/actuator/health/readiness", "/api/v1/network", "/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/demo-accounts", "/api/v1/auth/demo-login").permitAll().anyRequest().authenticated())
            .formLogin(f -> f.loginProcessingUrl("/api/v1/auth/login")
                .successHandler((q,s,a) -> { s.setContentType("application/json"); s.getWriter().write("{\"authenticated\":true}"); })
                .failureHandler((q,s,e) -> { s.setStatus(401); s.setContentType("application/json"); s.getWriter().write("{\"code\":\"INVALID_CREDENTIALS\",\"message\":\"Check your username and password.\"}"); }))
            .logout(l -> l.logoutUrl("/api/v1/auth/logout").logoutSuccessHandler((q,s,a) -> s.setStatus(204)))
            .exceptionHandling(e -> e.authenticationEntryPoint((q,s,x) -> { s.setStatus(401); s.setContentType("application/json"); s.getWriter().write("{\"code\":\"AUTH_REQUIRED\",\"message\":\"Sign in to continue.\"}"); })
                .accessDeniedHandler((q,s,x) -> { s.setStatus(403); s.setContentType("application/json"); s.getWriter().write("{\"code\":\"ACCESS_DENIED\",\"message\":\"Permission or CSRF token missing.\"}"); }))
            .requestCache(c -> c.disable());
        http.addFilterBefore(new ActiveAccountFilter(jdbc),org.springframework.security.web.access.intercept.AuthorizationFilter.class);
        return http.build();
    }
}
