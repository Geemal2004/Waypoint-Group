package lk.waypoint.core.demo;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(-10)
public class SharedNetworkSeed implements CommandLineRunner {
    private final JdbcTemplate jdbc;
    private final Path file;
    public SharedNetworkSeed(JdbcTemplate jdbc,@Value("${waypoint.network-import:/seed/shared-network.sql}") String file) { this.jdbc=jdbc; this.file=Path.of(file); }
    @Override @Transactional(rollbackFor=Exception.class) public void run(String... args) throws Exception {
        // Generated locally from supplied files; never embed restricted datasets in a public image/repository.
        if(!Files.isRegularFile(file)) return;
        jdbc.execute("select pg_advisory_xact_lock(73429011)");
        String digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
        if(jdbc.queryForObject("select count(*) from seed_imports where digest=?",Integer.class,digest)>0) return;
        new ResourceDatabasePopulator(new FileSystemResource(file)).execute(jdbc.getDataSource());
        jdbc.update("insert into seed_imports(digest) values(?)",digest);
    }
}
