"""Operational Audit Log iterator with structured machine-readable streaming and playback."""

from __future__ import annotations

import json
from typing import Iterator, List, Optional
from src.anticipator.models import AuditLogEntry


class AuditLogIterator:
    """Manages structured machine-readable functional-operational audit log entries with hyperloop integration."""

    def __init__(self, entries: Optional[List[AuditLogEntry]] = None):
        self._entries: List[AuditLogEntry] = entries or []

    def append(self, entry: AuditLogEntry) -> None:
        self._entries.append(entry)

    def __iter__(self) -> Iterator[AuditLogEntry]:
        return iter(self._entries)

    def __len__(self) -> int:
        return len(self._entries)

    def to_ndjson(self) -> str:
        """Exports all audit log entries to newline-delimited JSON (NDJSON) string."""
        return "\n".join(entry.to_ndjson() for entry in self._entries)

    def to_dict_list(self) -> List[dict]:
        return [entry.model_dump() for entry in self._entries]

    @classmethod
    def from_ndjson(cls, ndjson_content: str) -> AuditLogIterator:
        """Parses machine-readable NDJSON into an AuditLogIterator instance."""
        entries: List[AuditLogEntry] = []
        for line in ndjson_content.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                entries.append(AuditLogEntry.model_validate(data))
            except (json.JSONDecodeError, ValueError):
                continue
        return cls(entries=entries)

    def filter_by_event(self, event_type: str) -> List[AuditLogEntry]:
        return [entry for entry in self._entries if entry.event_type == event_type]

    def filter_converged(self) -> List[AuditLogEntry]:
        return [
            entry
            for entry in self._entries
            if entry.hyperloop_telemetry and entry.hyperloop_telemetry.converged
        ]
