package lk.waypoint.core.identity;
import java.io.IOException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Administrative account changes revoke existing sessions on their next request. */
public class ActiveAccountFilter extends OncePerRequestFilter {
 private final JdbcTemplate db;
 public ActiveAccountFilter(JdbcTemplate db){this.db=db;}
 @Override protected void doFilterInternal(HttpServletRequest q,HttpServletResponse s,FilterChain chain)throws ServletException,IOException{
  var auth=SecurityContextHolder.getContext().getAuthentication();
  if(auth!=null&&auth.getPrincipal() instanceof Account a&&db.queryForObject("select count(*) from accounts where id=? and enabled and role=? and depot_code=?",Integer.class,a.id(),a.role(),a.depot())!=1){
   var session=q.getSession(false);if(session!=null)session.invalidate();SecurityContextHolder.clearContext();s.setStatus(401);s.setContentType("application/json");s.getWriter().write("{\"code\":\"SESSION_REVOKED\",\"message\":\"Your account changed. Sign in again; saved evidence remains on this device.\"}");return;
  }
  chain.doFilter(q,s);
 }
}
