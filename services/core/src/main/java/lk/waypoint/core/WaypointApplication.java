package lk.waypoint.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class WaypointApplication {
    @Bean java.time.Clock operationalClock() { return java.time.Clock.systemUTC(); }
    public static void main(String[] args) {
        SpringApplication.run(WaypointApplication.class, args);
    }
}
