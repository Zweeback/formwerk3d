"""Cascade tree traverser executing hierarchical cascading event propagations across repository hierarchies."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from src.anticipator.models import WebhookEvent, WebhookEventType, AnticipationHypothesis
from src.anticipator.inverter import InversionEngine


class CascadeNode:
    def __init__(
        self,
        event_type: WebhookEventType,
        confidence: float,
        depth: int,
        parent: Optional[CascadeNode] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.event_type = event_type
        self.confidence = confidence
        self.depth = depth
        self.parent = parent
        self.children: List[CascadeNode] = []
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type.value,
            "confidence": self.confidence,
            "depth": self.depth,
            "metadata": self.metadata,
            "children": [child.to_dict() for child in self.children],
        }


class CascadeTraverser:
    """Traverses cascading trees of anticipated events across repository topologies."""

    def __init__(self, inverter: Optional[InversionEngine] = None, max_depth: int = 3, min_confidence: float = 0.1):
        self.inverter = inverter or InversionEngine()
        self.max_depth = max_depth
        self.min_confidence = min_confidence

    def build_cascade_tree(self, root_event: WebhookEvent) -> CascadeNode:
        """Recursively builds the cascading anticipation tree up to max_depth."""
        root = CascadeNode(
            event_type=root_event.event_type,
            confidence=1.0,
            depth=0,
            metadata={"root_event_id": root_event.id, "actor": root_event.actor},
        )
        self._expand_node(root, 1)
        return root

    def _expand_node(self, node: CascadeNode, current_depth: int) -> None:
        if current_depth > self.max_depth:
            return

        mock_event = WebhookEvent(
            id=f"cascade_sim_d{current_depth}",
            event_type=node.event_type,
        )
        hypotheses = self.inverter.anticipate_next_events(mock_event, cascade_depth=current_depth)

        for hyp in hypotheses:
            compound_confidence = round(node.confidence * hyp.confidence_score, 4)
            if compound_confidence < self.min_confidence:
                continue

            child_node = CascadeNode(
                event_type=hyp.target_event_type,
                confidence=compound_confidence,
                depth=current_depth,
                parent=node,
                metadata={
                    "inversion_delta": hyp.inversion_delta,
                    "estimated_arrival_window_seconds": hyp.estimated_arrival_window_seconds,
                },
            )
            node.children.append(child_node)
            self._expand_node(child_node, current_depth + 1)

    def traverse_cascade(self, root: CascadeNode) -> List[CascadeNode]:
        """Traverses the cascade tree in breadth-first order returning all anticipated downstream nodes."""
        results: List[CascadeNode] = []
        queue = [root]
        while queue:
            curr = queue.pop(0)
            results.append(curr)
            queue.extend(curr.children)
        return results
