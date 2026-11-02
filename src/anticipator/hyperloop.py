"""Hyperloop feedback loop controller with recursive scaling and convergence tracking."""

from __future__ import annotations

import math
from typing import Callable, Dict, List, Optional
from src.anticipator.models import HyperloopSignal, AnticipationHypothesis


class HyperloopController:
    """Implements recursive scaling hyperloop feedback loops to stabilize and refine anticipation predictions."""

    def __init__(
        self,
        damping_factor: float = 0.85,
        convergence_threshold: float = 0.01,
        max_iterations: int = 15,
        recursive_scale_base: float = 1.05,
    ):
        self.damping_factor = damping_factor
        self.convergence_threshold = convergence_threshold
        self.max_iterations = max_iterations
        self.recursive_scale_base = recursive_scale_base

    def run_feedback_loop(
        self,
        hypotheses: List[AnticipationHypothesis],
        evaluator_fn: Optional[Callable[[Dict[str, float]], float]] = None,
    ) -> List[HyperloopSignal]:
        """Executes recursive feedback iterations adjusting confidence and inversion balances until convergence."""
        signals: List[HyperloopSignal] = []

        if not hypotheses:
            return signals

        # Baseline score vector
        current_scores = {h.target_event_type.value: h.confidence_score for h in hypotheses}

        for iteration in range(1, self.max_iterations + 1):
            # Calculate recursive scaling factor
            recursive_scale = round(math.pow(self.recursive_scale_base, iteration), 4)

            # Measure variance / error
            avg_score = sum(current_scores.values()) / max(len(current_scores), 1)
            residual_error = round(
                sum((s - avg_score) ** 2 for s in current_scores.values()) / max(len(current_scores), 1),
                6,
            )

            converged = residual_error <= self.convergence_threshold

            sig = HyperloopSignal(
                iteration_step=iteration,
                damping_factor=self.damping_factor,
                residual_error=residual_error,
                recursive_scale=recursive_scale,
                converged=converged,
                telemetry={
                    "scores": current_scores.copy(),
                    "evaluator_metric": evaluator_fn(current_scores) if evaluator_fn else None,
                },
            )
            signals.append(sig)

            if converged:
                break

            # Feedback step with damping and scaling
            for k in current_scores:
                current_scores[k] = round(
                    current_scores[k] * self.damping_factor + (1.0 - self.damping_factor) * avg_score,
                    4,
                )

        # Apply converged adjustments back to hypotheses
        for h in hypotheses:
            if h.target_event_type.value in current_scores:
                h.confidence_score = current_scores[h.target_event_type.value]

        return signals
