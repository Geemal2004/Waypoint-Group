package lk.waypoint.core.workflow;

import java.time.*;
import java.util.List;

public final class CalendarPolicy {
    private CalendarPolicy() {}
    public static LocalDate earliest(LocalDate requested,Instant acceptedAt) {
        var now=acceptedAt.atZone(ZoneId.of("Asia/Colombo"));
        var cutoffDate=now.toLocalDate().plusDays(now.toLocalTime().isBefore(LocalTime.of(16,0))?1:2);
        return requested.isAfter(cutoffDate)?requested:cutoffDate;
    }
    public static LocalDate next(List<LocalDate> operatingDays,boolean demoMondayStyle) {
        return operatingDays.stream().filter(day -> !demoMondayStyle || day.getDayOfWeek()==DayOfWeek.MONDAY).min(LocalDate::compareTo)
            .orElseThrow(() -> new ApiException(422,"NO_ELIGIBLE_DAY","No eligible date exists in the persisted fixture calendar."));
    }
}
