package lk.waypoint.core.workflow;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;

class WorkflowRulesTest {
    @Test void cannotDeliverBeforeArrivalOrReceiveBeforeProof() {
        assertThatThrownBy(() -> WorkflowRules.transition("RELEASED","DELIVERED")).isInstanceOf(ApiException.class).hasMessageContaining("RELEASED");
        assertThatThrownBy(() -> WorkflowRules.transition("IN_TRANSIT","RECEIVED_AT_STORE")).isInstanceOf(ApiException.class);
    }
    @Test void departureAndTerminalStatesCannotBeEditedAsLoading() {
        for(String state:new String[]{"IN_TRANSIT","ARRIVED","DELIVERED","RECEIVED_AT_STORE","DEFERRED"}) {
            assertThatThrownBy(() -> WorkflowRules.transition(state,"LOADING")).isInstanceOf(ApiException.class);
        }
    }
    @Test void receivingCannotInventUnitsAboveDelivered() {
        assertThatCode(() -> WorkflowRules.quantity(8,8)).doesNotThrowAnyException();
        assertThatThrownBy(() -> WorkflowRules.quantity(10,8)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> WorkflowRules.quantity(-1,8)).isInstanceOf(ApiException.class);
    }
    @Test void proofRejectsSpoofedImageTypeAndEmptyEvidence() {
        assertThatThrownBy(() -> OperationsService.validateImage("image/png",new byte[]{1,2,3})).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> OperationsService.validateImage("text/html",new byte[]{1})).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> OperationsService.validateImage("image/jpeg",new byte[0])).isInstanceOf(ApiException.class);
    }
}
