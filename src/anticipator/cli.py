"""Command-line interface for the Webhook Anticipator."""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from src.anticipator.models import WebhookEvent, WebhookEventType
from src.anticipator.engine import AnticipatorEngine


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Webhook Anticipator: recursive scaling hyperloop audit-log anticipation engine."
    )
    parser.add_argument(
        "--event",
        type=str,
        default="push",
        choices=[e.value for e in WebhookEventType],
        help="Input webhook event type to anticipate from",
    )
    parser.add_argument(
        "--repository",
        type=str,
        default="formwerk3d",
        help="Target repository identifier",
    )
    parser.add_argument(
        "--branch",
        type=str,
        default="main",
        help="Target branch",
    )
    parser.add_argument(
        "--damping",
        type=float,
        default=0.85,
        help="Hyperloop feedback damping factor",
    )
    parser.add_argument(
        "--max-cascade-depth",
        type=int,
        default=2,
        help="Maximum cascade tree traversal depth",
    )
    parser.add_argument(
        "--export-audit-ndjson",
        action="store_true",
        help="Output machine-readable operational audit log in NDJSON format",
    )

    args = parser.parse_args()

    engine = AnticipatorEngine()
    engine.hyperloop.damping_factor = args.damping
    engine.traverser.max_depth = args.max_cascade_depth

    input_event = WebhookEvent(
        id=f"evt_{uuid.uuid4().hex[:8]}",
        event_type=WebhookEventType(args.event),
        repository=args.repository,
        branch=args.branch,
        actor="cli-user",
    )

    result = engine.process_event(input_event)

    if args.export_audit_ndjson:
        print(engine.audit_log.to_ndjson())
    else:
        print(json.dumps(result, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
