package lk.waypoint.core.workflow;

import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CalendarPolicyTest {
    @Test void cutoffUsesSriLankaTimeAndClosesAtExactlySixteen() {
        LocalDate requested=LocalDate.of(2026,10,6);
        assertThat(CalendarPolicy.earliest(requested,Instant.parse("2026-10-05T10:29:59Z"))).isEqualTo(requested);
        assertThat(CalendarPolicy.earliest(requested,Instant.parse("2026-10-05T10:30:00Z"))).isEqualTo(LocalDate.of(2026,10,7));
    }
    @Test void operatingCalendarSkipsClosedDaysRatherThanAssumingTomorrow() {
        LocalDate monday=LocalDate.of(2026,10,5);
        assertThat(CalendarPolicy.next(List.of(monday,monday.plusDays(1)),false)).isEqualTo(monday);
        assertThatThrownBy(() -> CalendarPolicy.next(List.of(),false)).isInstanceOf(ApiException.class);
    }
    @Test void demoStyleWeeklyScheduleIsSeparateFromGeneralOperatingDays() {
        LocalDate tuesday=LocalDate.of(2026,10,6);
        assertThat(CalendarPolicy.next(List.of(tuesday,tuesday.plusDays(6)),true)).isEqualTo(tuesday.plusDays(6));
    }
    @Test void futureRequestedDateIsPreservedAndColomboDayDiffersFromUtcDay() {
        assertThat(CalendarPolicy.earliest(LocalDate.of(2026,10,6),Instant.parse("2026-10-03T20:00:00Z"))).isEqualTo(LocalDate.of(2026,10,6));
        assertThat(CalendarPolicy.earliest(LocalDate.of(2026,10,3),Instant.parse("2026-10-03T20:00:00Z"))).isEqualTo(LocalDate.of(2026,10,5));
    }
}
