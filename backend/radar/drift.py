"""Streaming Campaign Emergence Detection using River ADWIN (Adaptive Windowing).

Tracks the velocity and novelty of incoming trajectory reports in real-time.
Automatically flags when incoming traffic exhibits a statistically significant
distribution shift upon report ingestion (not upon dashboard reads).
"""
import time
from collections import defaultdict
from river import drift


class StreamingRadarDriftDetector:
    def __init__(self, delta=0.01):
        """Initializes ADWIN streaming monitors for trajectory streams."""
        self.delta = delta
        self.novelty_monitor = drift.ADWIN(delta=self.delta)
        self.monitors = defaultdict(lambda: drift.ADWIN(delta=self.delta))
        self.history = defaultdict(list)
        self.alerts = []

    def observe_report(self, report, timestamp=None):
        """Update streaming ADWIN monitor when a report is ingested (POST /api/fingerprints)."""
        traj = report.get('trajectory')
        if not traj or len(traj) != 64:
            return None
        from radar.cluster import compute_novelty
        nov_info = compute_novelty(traj)
        novelty_score = float(nov_info.get('novelty_score', 0.0))
        self.novelty_monitor.update(novelty_score)
        self.history['novelty_stream'].append(novelty_score)
        ts = timestamp or time.time()
        if self.novelty_monitor.drift_detected:
            alert = {
                'type': 'STREAMING_NOVELTY_DRIFT',
                'status': 'DRIFT_DETECTED',
                'confidence': 'HIGH',
                'p_value_delta': self.delta,
                'mean_novelty': round(float(self.novelty_monitor.estimation), 4),
                'message': f'Statistically significant distribution shift in incoming fraud trajectory stream. Mean novelty shifted to {self.novelty_monitor.estimation:.2f}.',
                'timestamp': ts
            }
            self.alerts.append(alert)
            return alert
        return None

    def observe(self, cluster_id, is_active=1, timestamp=None):
        """Update streaming ADWIN monitor for a specific cluster."""
        monitor = self.monitors[str(cluster_id)]
        monitor.update(float(is_active))
        self.history[str(cluster_id)].append(is_active)

        drift_detected = monitor.drift_detected
        alert = None
        if drift_detected:
            alert = {
                'cluster_id': str(cluster_id),
                'status': 'DRIFT_DETECTED',
                'confidence': 'HIGH',
                'p_value_delta': self.delta,
                'message': f'Statistically significant distribution shift in Cluster {cluster_id}. Accelerated velocity observed by River ADWIN.',
                'timestamp': timestamp or time.time()
            }
            self.alerts.append(alert)
        return {
            'drift_detected': drift_detected,
            'alert': alert,
            'observations_count': len(self.history[str(cluster_id)])
        }

    def get_active_alerts(self):
        """Returns all triggered drift alerts."""
        return list(self.alerts)

    def reset(self):
        """Resets monitors."""
        self.novelty_monitor = drift.ADWIN(delta=self.delta)
        self.monitors.clear()
        self.history.clear()
        self.alerts.clear()
