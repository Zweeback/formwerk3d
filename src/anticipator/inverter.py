"""Inversion engine calculating inverse mappings of repository state transitions and forward causality anticipation."""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional
from src.anticipator.models import WebhookEvent, WebhookEventType, AnticipationHypothesis


class InversionEngine:
    """Computes inversion vectors from observed repository actions to project subsequent webhook actions."""

    # Precursor-to-consequence causal transition probability matrices
    DEFAULT_TRANSITION_PROBABILITIES: Dict[WebhookEventType, Dict[WebhookEventType, float]] = {
        WebhookEventType.PUSH: {
            WebhookEventType.WORKFLOW_RUN: 0.95,
            WebhookEventType.PULL_REQUEST: 0.60,
            WebhookEventType.DEPLOYMENT: 0.40,
        },
        WebhookEventType.PULL_REQUEST: {
            WebhookEventType.WORKFLOW_RUN: 0.90,
            WebhookEventType.PUSH: 0.50,
            WebhookEventType.RELEASE: 0.30,
        },
        WebhookEventType.WORKFLOW_RUN: {
            WebhookEventType.DEPLOYMENT: 0.85,
            WebhookEventType.RELEASE: 0.35,
        },
        WebhookEventType.RELEASE: {
            WebhookEventType.DEPLOYMENT: 0.90,
            WebhookEventType.REPOSITORY_DISPATCH: 0.70,
        },
        WebhookEventType.REPOSITORY_DISPATCH: {
            WebhookEventType.WORKFLOW_RUN: 0.80,
        },
        WebhookEventType.DEPLOYMENT: {
            WebhookEventType.WORKFLOW_RUN: 0.20,
        },
        WebhookEventType.ISSUE: {
            WebhookEventType.PULL_REQUEST: 0.50,
        },
    }

    def __init__(self, custom_weights: Optional[Dict[WebhookEventType, Dict[WebhookEventType, float]]] = None):
        self.transitions = custom_weights or self.DEFAULT_TRANSITION_PROBABILITIES

    def invert_state(self, event: WebhookEvent) -> Dict[str, float]:
        """Invert the given event state into a normalized forward causal vector."""
        targets = self.transitions.get(event.event_type, {WebhookEventType.WORKFLOW_RUN: 0.5})
        total = sum(targets.values()) or 1.0
        return {target.value: round(weight / total, 4) for target, weight in targets.items()}

    def anticipate_next_events(self, event: WebhookEvent, cascade_depth: int = 1) -> List[AnticipationHypothesis]:
        """Generate anticipation hypotheses based on inverted causality vector."""
        causal_vector = self.invert_state(event)
        hypotheses: List[AnticipationHypothesis] = []

        for evt_type_str, prob in causal_vector.items():
            evt_type = WebhookEventType(evt_type_str)
            confidence = min(1.0, max(0.0, prob * (1.0 / (1.0 + 0.1 * cascade_depth))))
            hypotheses.append(
                AnticipationHypothesis(
                    id=f"ant_{uuid.uuid4().hex[:12]}",
                    target_event_type=evt_type,
                    confidence_score=round(confidence, 4),
                    causal_vector=causal_vector,
                    cascade_depth=cascade_depth,
                    inversion_delta={
                        "source_event_id": event.id,
                        "source_event_type": event.event_type.value,
                        "inversion_ratio": round(1.0 - prob, 4),
                    },
                    estimated_arrival_window_seconds=round(30.0 * cascade_depth, 1),
                    reasoning=f"Anticipated via causal inversion from {event.event_type.value} with confidence {confidence:.2f}",
                )
            )

        # Sort descending by confidence score
        hypotheses.sort(key=lambda h: h.confidence_score, reverse=True)
        return hypotheses
