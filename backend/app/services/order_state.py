"""Order state machine: centralized state transition validation.

All order status changes MUST go through this module.
Business code must never directly set order.status.
"""

from enum import Enum

from app.core.exceptions import ForbiddenException, InvalidStateTransitionException


class OrderStatus(str, Enum):
    PENDING_CONFIRM = "PENDING_CONFIRM"
    CONFIRMED = "CONFIRMED"
    WAITING_SHOOT = "WAITING_SHOOT"
    WAITING_UPLOAD = "WAITING_UPLOAD"
    ANALYZING = "ANALYZING"
    WAITING_REVIEW = "WAITING_REVIEW"
    WAITING_SELECTION = "WAITING_SELECTION"
    WAITING_RETOUCH = "WAITING_RETOUCH"
    RETOUCHING = "RETOUCHING"
    WAITING_CLIENT_CONFIRM = "WAITING_CLIENT_CONFIRM"
    WAITING_DELIVERY = "WAITING_DELIVERY"
    DELIVERED = "DELIVERED"
    ARCHIVED = "ARCHIVED"
    CANCELLED = "CANCELLED"


TERMINAL_STATES = frozenset({OrderStatus.ARCHIVED, OrderStatus.CANCELLED})

TRANSITIONS: dict[OrderStatus, dict[OrderStatus, frozenset[str]]] = {
    OrderStatus.PENDING_CONFIRM: {
        OrderStatus.CONFIRMED: frozenset({"photographer"}),
        OrderStatus.CANCELLED: frozenset({"photographer", "client"}),
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.WAITING_SHOOT: frozenset({"system", "photographer"}),
        OrderStatus.CANCELLED: frozenset({"photographer", "client"}),
    },
    OrderStatus.WAITING_SHOOT: {
        OrderStatus.WAITING_UPLOAD: frozenset({"photographer"}),
        OrderStatus.CANCELLED: frozenset({"photographer"}),
    },
    OrderStatus.WAITING_UPLOAD: {
        OrderStatus.ANALYZING: frozenset({"system"}),
    },
    OrderStatus.ANALYZING: {
        OrderStatus.WAITING_REVIEW: frozenset({"system", "photographer"}),
    },
    OrderStatus.WAITING_REVIEW: {
        OrderStatus.WAITING_SELECTION: frozenset({"photographer"}),
    },
    OrderStatus.WAITING_SELECTION: {
        OrderStatus.WAITING_RETOUCH: frozenset({"client"}),
    },
    OrderStatus.WAITING_RETOUCH: {
        OrderStatus.RETOUCHING: frozenset({"photographer"}),
    },
    OrderStatus.RETOUCHING: {
        OrderStatus.WAITING_CLIENT_CONFIRM: frozenset({"photographer"}),
    },
    OrderStatus.WAITING_CLIENT_CONFIRM: {
        OrderStatus.RETOUCHING: frozenset({"client"}),
        OrderStatus.WAITING_DELIVERY: frozenset({"client"}),
    },
    OrderStatus.WAITING_DELIVERY: {
        OrderStatus.DELIVERED: frozenset({"photographer"}),
    },
    OrderStatus.DELIVERED: {
        OrderStatus.ARCHIVED: frozenset({"system", "photographer"}),
    },
}


class OrderStateMachine:
    """Centralized order state transition validator."""

    @staticmethod
    def is_terminal(status: OrderStatus) -> bool:
        return status in TERMINAL_STATES

    @staticmethod
    def can_transition(from_status: OrderStatus, to_status: OrderStatus) -> bool:
        return to_status in TRANSITIONS.get(from_status, {})

    @staticmethod
    def get_allowed_targets(from_status: OrderStatus) -> set[OrderStatus]:
        return set(TRANSITIONS.get(from_status, {}).keys())

    @staticmethod
    def get_allowed_roles(from_status: OrderStatus, to_status: OrderStatus) -> frozenset[str]:
        return TRANSITIONS.get(from_status, {}).get(to_status, frozenset())

    @staticmethod
    def transition(
        from_status: OrderStatus,
        to_status: OrderStatus,
        actor_role: str,
    ) -> OrderStatus:
        """Validate and execute a state transition.

        Args:
            from_status: Current order status.
            to_status: Target order status.
            actor_role: Role of the user initiating the transition.

        Returns:
            The new status (to_status) if transition is valid.

        Raises:
            InvalidStateTransitionException: If the transition is not allowed.
            ForbiddenException: If the actor role is not permitted for this transition.
        """
        if OrderStateMachine.is_terminal(from_status):
            raise InvalidStateTransitionException(from_status.value, to_status.value)

        if not OrderStateMachine.can_transition(from_status, to_status):
            raise InvalidStateTransitionException(from_status.value, to_status.value)

        allowed_roles = OrderStateMachine.get_allowed_roles(from_status, to_status)
        if actor_role not in allowed_roles:
            raise ForbiddenException(
                detail=(
                    f"Role '{actor_role}' cannot transition"
                    f" from {from_status.value} to {to_status.value}"
                )
            )

        return to_status
