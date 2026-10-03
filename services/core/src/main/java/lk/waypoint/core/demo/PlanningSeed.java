package lk.waypoint.core.demo;
import java.nio.file.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
@Component
@Order(10)
@ConditionalOnProperty(name="waypoint.demo-seed",havingValue="true")
public class PlanningSeed implements CommandLineRunner {
    private final JdbcTemplate db;private final Path file;
    public PlanningSeed(JdbcTemplate db,@Value("${waypoint.planning-import:/seed/planning-scenario.sql}") String file){this.db=db;this.file=Path.of(file);}
    @Override @Transactional public void run(String... args){
        if(!Files.isRegularFile(file))return;
        db.execute("select pg_advisory_xact_lock(73429012)");
        new ResourceDatabasePopulator(new FileSystemResource(file)).execute(db.getDataSource());
    }
}
