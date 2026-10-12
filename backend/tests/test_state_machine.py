"""Order state machine tests.

Covers all 17 legal transitions, illegal transitions,
role permissions, and terminal state behavior.
"""

import pytest

from app.core.exceptions import ForbiddenException, InvalidStateTransitionException
from app.services.order_state import OrderStateMachine, OrderStatus

SM = OrderStateMachine
S = OrderStatus


class TestLegalTransitions:
    """Test all 17 legal from->to transition pairs."""

    @pytest.mark.parametrize("from_s,to_s,role", [
        (S.PENDING_CONFIRM, S.CONFIRMED, "photographer"),
        (S.PENDING_CONFIRM, S.CANCELLED, "photographer"),
        (S.PENDING_CONFIRM, S.CANCELLED, "client"),
        (S.CONFIRMED, S.WAITING_SHOOT, "photographer"),
        (S.CONFIRMED, S.WAITING_SHOOT, "system"),
        (S.CONFIRMED, S.CANCELLED, "photographer"),
        (S.CONFIRMED, S.CANCELLED, "client"),
        (S.WAITING_SHOOT, S.WAITING_UPLOAD, "photographer"),
        (S.WAITING_SHOOT, S.CANCELLED, "photographer"),
        (S.WAITING_UPLOAD, S.ANALYZING, "system"),
        (S.ANALYZING, S.WAITING_REVIEW, "system"),
        (S.ANALYZING, S.WAITING_REVIEW, "photographer"),
        (S.WAITING_REVIEW, S.WAITING_SELECTION, "photographer"),
        (S.WAITING_SELECTION, S.WAITING_RETOUCH, "client"),
        (S.WAITING_RETOUCH, S.RETOUCHING, "photographer"),
        (S.RETOUCHING, S.WAITING_CLIENT_CONFIRM, "photographer"),
        (S.WAITING_CLIENT_CONFIRM, S.RETOUCHING, "client"),
        (S.WAITING_CLIENT_CONFIRM, S.WAITING_DELIVERY, "client"),
        (S.WAITING_DELIVERY, S.DELIVERED, "photographer"),
        (S.DELIVERED, S.ARCHIVED, "photographer"),
        (S.DELIVERED, S.ARCHIVED, "system"),
    ])
    def test_valid_transition(self, from_s, to_s, role):
        result = SM.transition(from_s, to_s, role)
        assert result == to_s


class TestIllegalTransitions:
    """Test illegal state transitions."""

    def test_skip_confirmed(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.PENDING_CONFIRM, S.WAITING_SHOOT, "photographer")

    def test_skip_to_delivered(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.CONFIRMED, S.DELIVERED, "photographer")

    def test_review_to_delivered(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.WAITING_REVIEW, S.DELIVERED, "photographer")

    def test_delivered_to_pending(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.DELIVERED, S.PENDING_CONFIRM, "photographer")

    def test_archived_cannot_transition(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.ARCHIVED, S.DELIVERED, "system")

    def test_cancelled_cannot_transition(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.CANCELLED, S.CONFIRMED, "photographer")

    def test_selection_to_delivered(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.WAITING_SELECTION, S.DELIVERED, "client")

    def test_retouch_to_archived(self):
        with pytest.raises(InvalidStateTransitionException):
            SM.transition(S.RETOUCHING, S.ARCHIVED, "photographer")


class TestRolePermissions:
    """Test that wrong roles are rejected."""

    def test_client_cannot_confirm_booking(self):
        with pytest.raises(ForbiddenException):
            SM.transition(S.PENDING_CONFIRM, S.CONFIRMED, "client")

    def test_photographer_cannot_submit_selection(self):
        with pytest.raises(ForbiddenException):
            SM.transition(S.WAITING_SELECTION, S.WAITING_RETOUCH, "photographer")

    def test_client_cannot_start_retouch(self):
        with pytest.raises(ForbiddenException):
            SM.transition(S.WAITING_RETOUCH, S.RETOUCHING, "client")

    def test_client_cannot_upload_final(self):
        with pytest.raises(ForbiddenException):
            SM.transition(S.WAITING_DELIVERY, S.DELIVERED, "client")


class TestTerminalStates:
    """Test terminal state detection."""

    def test_archived_is_terminal(self):
        assert SM.is_terminal(S.ARCHIVED) is True

    def test_cancelled_is_terminal(self):
        assert SM.is_terminal(S.CANCELLED) is True

    def test_delivered_is_not_terminal(self):
        assert SM.is_terminal(S.DELIVERED) is False

    def test_pending_confirm_is_not_terminal(self):
        assert SM.is_terminal(S.PENDING_CONFIRM) is False


class TestAllowedTargets:
    """Test get_allowed_targets helper."""

    def test_pending_confirm_targets(self):
        targets = SM.get_allowed_targets(S.PENDING_CONFIRM)
        assert targets == {S.CONFIRMED, S.CANCELLED}

    def test_waiting_client_confirm_targets(self):
        targets = SM.get_allowed_targets(S.WAITING_CLIENT_CONFIRM)
        assert targets == {S.RETOUCHING, S.WAITING_DELIVERY}

    def test_archived_has_no_targets(self):
        targets = SM.get_allowed_targets(S.ARCHIVED)
        assert targets == set()

    def test_cancelled_has_no_targets(self):
        targets = SM.get_allowed_targets(S.CANCELLED)
        assert targets == set()


class TestCanTransition:
    """Test can_transition boolean helper."""

    def test_valid_pair(self):
        assert SM.can_transition(S.PENDING_CONFIRM, S.CONFIRMED) is True

    def test_invalid_pair(self):
        assert SM.can_transition(S.PENDING_CONFIRM, S.DELIVERED) is False

    def test_terminal_has_no_transitions(self):
        assert SM.can_transition(S.ARCHIVED, S.DELIVERED) is False
