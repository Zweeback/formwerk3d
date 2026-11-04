from __future__ import annotations

import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WebhookEventType(str, Enum):
    PUSH = "push"
    PULL_REQUEST = "pull_request"
    ISSUE = "issues"
    RELEASE = "release"
    WORKFLOW_RUN = "workflow_run"
    REPOSITORY_DISPATCH = "repository_dispatch"
    DEPLOYMENT = "deployment"
    CUSTOM = "custom"


class WebhookEvent(BaseModel):
    id: str
    event_type: WebhookEventType
    timestamp: datetime.datetime = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc))
    actor: str = "system"
    repository: str = "formwerk3d"
    branch: Optional[str] = "main"
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnticipationHypothesis(BaseModel):
    id: str
    target_event_type: WebhookEventType
    confidence_score: float = Field(ge=0.0, le=1.0)
    causal_vector: Dict[str, float] = Field(default_factory=dict)
    cascade_depth: int = 0
    inversion_delta: Dict[str, Any] = Field(default_factory=dict)
    estimated_arrival_window_seconds: float = 60.0
    reasoning: str = ""
    timestamp: datetime.datetime = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc))


class HyperloopSignal(BaseModel):
    iteration_step: int
    damping_factor: float = 0.85
    residual_error: float = 0.0
    recursive_scale: float = 1.0
    converged: bool = False
    telemetry: Dict[str, Any] = Field(default_factory=dict)


class AuditLogEntry(BaseModel):
    log_id: str
    timestamp: datetime.datetime = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc))
    anticipation_id: Optional[str] = None
    event_type: str
    inversion_state: Dict[str, Any] = Field(default_factory=dict)
    cascade_tree_level: int = 0
    hyperloop_telemetry: Optional[HyperloopSignal] = None
    machine_readable_payload: Dict[str, Any] = Field(default_factory=dict)
    operational_status: str = "OK"

    def to_ndjson(self) -> str:
        return self.model_dump_json()
