"""Unified Webhook Anticipator Engine integrating inversion, cascading traversal, and hyperloop feedback."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional
from src.anticipator.models import (
    WebhookEvent,
    WebhookEventType,
    AnticipationHypothesis,
    AuditLogEntry,
)
from src.anticipator.inverter import InversionEngine
from src.anticipator.traverser import CascadeTraverser, CascadeNode
from src.anticipator.hyperloop import HyperloopController
from src.anticipator.audit_log import AuditLogIterator


class AnticipatorEngine:
    """The central Webhook Anticipator orchestrator."""

    def __init__(
        self,
        inverter: Optional[InversionEngine] = None,
        traverser: Optional[CascadeTraverser] = None,
        hyperloop: Optional[HyperloopController] = None,
    ):
        self.inverter = inverter or InversionEngine()
        self.traverser = traverser or CascadeTraverser(inverter=self.inverter)
        self.hyperloop = hyperloop or HyperloopController()
        self.audit_log = AuditLogIterator()

    def process_event(
        self,
        event: WebhookEvent,
        enable_hyperloop: bool = True,
        build_cascade: bool = True,
    ) -> Dict[str, Any]:
        """Processes an incoming repository webhook event, anticipates next events, runs hyperloop scaling feedback loops,

        and records operational audit log iterations.
        """
        # 1. State Inversion & direct anticipation
        direct_hypotheses = self.inverter.anticipate_next_events(event, cascade_depth=1)

        # 2. Hyperloop recursive scaling feedback loops
        hyperloop_signals = []
        if enable_hyperloop and direct_hypotheses:
            hyperloop_signals = self.hyperloop.run_feedback_loop(direct_hypotheses)

        # 3. Cascading tree traversal
        cascade_tree: Optional[CascadeNode] = None
        flattened_cascade: List[CascadeNode] = []
        if build_cascade:
            cascade_tree = self.traverser.build_cascade_tree(event)
            flattened_cascade = self.traverser.traverse_cascade(cascade_tree)

        # 4. Generate structured machine-readable Audit Log entries
        last_signal = hyperloop_signals[-1] if hyperloop_signals else None
        for hyp in direct_hypotheses:
            entry = AuditLogEntry(
                log_id=f"audit_{uuid.uuid4().hex[:12]}",
                anticipation_id=hyp.id,
                event_type=hyp.target_event_type.value,
                inversion_state=hyp.inversion_delta,
                cascade_tree_level=hyp.cascade_depth,
                hyperloop_telemetry=last_signal,
                machine_readable_payload={
                    "source_event": event.model_dump(mode="json"),
                    "confidence": hyp.confidence_score,
                    "estimated_arrival_window_seconds": hyp.estimated_arrival_window_seconds,
                    "reasoning": hyp.reasoning,
                },
                operational_status="ANTICIPATED",
            )
            self.audit_log.append(entry)

        return {
            "source_event_id": event.id,
            "source_event_type": event.event_type.value,
            "direct_hypotheses": [h.model_dump(mode="json") for h in direct_hypotheses],
            "hyperloop_converged": last_signal.converged if last_signal else False,
            "hyperloop_iterations": len(hyperloop_signals),
            "cascade_node_count": len(flattened_cascade),
            "cascade_tree": cascade_tree.to_dict() if cascade_tree else None,
            "audit_log_entries_count": len(self.audit_log),
        }
