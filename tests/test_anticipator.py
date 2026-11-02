import json
import pytest
from src.anticipator.models import (
    WebhookEvent,
    WebhookEventType,
    AnticipationHypothesis,
    HyperloopSignal,
    AuditLogEntry,
)
from src.anticipator.inverter import InversionEngine
from src.anticipator.traverser import CascadeTraverser, CascadeNode
from src.anticipator.hyperloop import HyperloopController
from src.anticipator.audit_log import AuditLogIterator
from src.anticipator.engine import AnticipatorEngine


def test_models_serialization():
    event = WebhookEvent(
        id="evt_123",
        event_type=WebhookEventType.PUSH,
        payload={"ref": "refs/heads/main", "commits": [{"message": "feat: 3d renderer"}]},
    )
    assert event.event_type == WebhookEventType.PUSH
    assert event.repository == "formwerk3d"

    signal = HyperloopSignal(
        iteration_step=1,
        damping_factor=0.85,
        residual_error=0.005,
        recursive_scale=1.05,
        converged=True,
    )
    assert signal.converged is True

    audit = AuditLogEntry(
        log_id="log_001",
        event_type="push",
        hyperloop_telemetry=signal,
        machine_readable_payload={"test": 123},
    )
    ndjson = audit.to_ndjson()
    assert "log_001" in ndjson
    parsed = json.loads(ndjson)
    assert parsed["hyperloop_telemetry"]["converged"] is True


def test_inversion_engine():
    inverter = InversionEngine()
    event = WebhookEvent(id="e1", event_type=WebhookEventType.PUSH)
    causal_vector = inverter.invert_state(event)

    assert WebhookEventType.WORKFLOW_RUN.value in causal_vector
    assert WebhookEventType.PULL_REQUEST.value in causal_vector
    assert sum(causal_vector.values()) == pytest.approx(1.0, rel=1e-2)

    hypotheses = inverter.anticipate_next_events(event, cascade_depth=1)
    assert len(hypotheses) > 0
    assert hypotheses[0].target_event_type == WebhookEventType.WORKFLOW_RUN
    assert hypotheses[0].confidence_score > 0.0


def test_cascade_traverser():
    traverser = CascadeTraverser(max_depth=2, min_confidence=0.05)
    root_event = WebhookEvent(id="root_1", event_type=WebhookEventType.PULL_REQUEST)
    tree = traverser.build_cascade_tree(root_event)

    assert tree.depth == 0
    assert tree.event_type == WebhookEventType.PULL_REQUEST
    assert len(tree.children) > 0

    all_nodes = traverser.traverse_cascade(tree)
    assert len(all_nodes) >= len(tree.children) + 1
    tree_dict = tree.to_dict()
    assert tree_dict["depth"] == 0
    assert "children" in tree_dict


def test_hyperloop_controller_convergence():
    inverter = InversionEngine()
    event = WebhookEvent(id="e1", event_type=WebhookEventType.PUSH)
    hypotheses = inverter.anticipate_next_events(event)

    controller = HyperloopController(
        damping_factor=0.8,
        convergence_threshold=0.01,
        max_iterations=10,
    )
    signals = controller.run_feedback_loop(hypotheses)

    assert len(signals) > 0
    # Final step should have converged or reached threshold
    last_signal = signals[-1]
    assert last_signal.residual_error <= 0.01 or last_signal.iteration_step == 10
    assert last_signal.recursive_scale >= 1.0


def test_audit_log_iterator_ndjson():
    iterator = AuditLogIterator()
    for i in range(3):
        iterator.append(
            AuditLogEntry(
                log_id=f"log_{i}",
                event_type="workflow_run" if i % 2 == 0 else "push",
                hyperloop_telemetry=HyperloopSignal(
                    iteration_step=i,
                    converged=(i > 0),
                ),
            )
        )

    assert len(iterator) == 3
    ndjson = iterator.to_ndjson()
    assert len(ndjson.strip().splitlines()) == 3

    reconstituted = AuditLogIterator.from_ndjson(ndjson)
    assert len(reconstituted) == 3
    assert len(reconstituted.filter_by_event("workflow_run")) == 2
    assert len(reconstituted.filter_converged()) == 2


def test_anticipator_engine_full_workflow():
    engine = AnticipatorEngine()
    event = WebhookEvent(
        id="evt_flow_1",
        event_type=WebhookEventType.RELEASE,
        payload={"action": "published", "tag": "v1.0.0"},
    )
    result = engine.process_event(event)

    assert result["source_event_id"] == "evt_flow_1"
    assert result["source_event_type"] == "release"
    assert len(result["direct_hypotheses"]) > 0
    assert result["hyperloop_converged"] is True
    assert result["cascade_node_count"] > 1
    assert result["audit_log_entries_count"] > 0
    assert len(engine.audit_log) > 0
