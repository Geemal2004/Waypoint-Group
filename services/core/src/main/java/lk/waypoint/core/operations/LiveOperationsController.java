package lk.waypoint.core.operations;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import lk.waypoint.core.identity.Account;

@RestController
@RequestMapping("/api/v1")
public class LiveOperationsController implements DisposableBean {
 private final LiveOperationsService live;
 private final ScheduledExecutorService ticks=Executors.newScheduledThreadPool(2);
 public LiveOperationsController(LiveOperationsService live){this.live=live;}
 @GetMapping("/live/network") public Map<String,Object> network(@AuthenticationPrincipal Account a,@RequestParam LocalDate day){return live.network(a,day);}
 @GetMapping("/orders/{id}/journey") public Map<String,Object> journey(@AuthenticationPrincipal Account a,@PathVariable UUID id){return live.journey(a,id);}
 @PostMapping("/location") public Map<String,Object> location(@AuthenticationPrincipal Account a,@RequestBody LiveOperationsService.Position q){return live.report(a,q);}
 @GetMapping("/orders/{id}/messages") public List<Map<String,Object>> messages(@AuthenticationPrincipal Account a,@PathVariable UUID id){return live.messages(a,id);}
 @PostMapping("/orders/{id}/messages") public Map<String,Object> message(@AuthenticationPrincipal Account a,@PathVariable UUID id,@RequestBody LiveOperationsService.Message q){return live.message(a,id,q);}
 @GetMapping(value="/live/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
 public ResponseEntity<SseEmitter> events(@AuthenticationPrincipal Account a,@RequestParam(defaultValue="0") long after,HttpServletRequest request){
  // Short streams reauthenticate on reconnect; every tick also checks active account/scopes.
  SseEmitter emitter=new SseEmitter(30000L);final long[] cursor={after};final ScheduledFuture<?>[] task={null};
  Runnable stop=()->{if(task[0]!=null)task[0].cancel(false);};
  emitter.onCompletion(stop);emitter.onTimeout(()->{stop.run();emitter.complete();});emitter.onError(e->stop.run());
  task[0]=ticks.scheduleWithFixedDelay(()->{try{var update=new LinkedHashMap<>(live.updates(a,cursor[0]));cursor[0]=((Number)update.get("cursor")).longValue();update.put("locations",live.locations(a));emitter.send(SseEmitter.event().name("operations").id(Long.toString(cursor[0])).data(update));}catch(Exception e){stop.run();emitter.completeWithError(e);}},0,2,TimeUnit.SECONDS);
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Accel-Buffering","no").body(emitter);
 }
 @Override public void destroy(){ticks.shutdownNow();}
}
