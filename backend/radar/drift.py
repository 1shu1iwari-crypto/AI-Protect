"""Streaming Campaign Emergence Detection using River ADWIN (Adaptive Windowing).

Tracks the velocity of incoming trajectory reports in real-time. Automatically flags
when an unverified cluster exhibits a statistically significant distribution shift,
alerting analysts to an emerging zero-day attack campaign.
"""
from river import drift
from collections import defaultdict


class StreamingRadarDriftDetector:
    def __init__(self, delta=0.002):
        """Initializes ADWIN streaming monitors per candidate signature / cluster."""
        self.delta = delta
        self.monitors = defaultdict(lambda: drift.ADWIN(delta=self.delta))
        self.history = defaultdict(list)
        self.alerts = []

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
                'timestamp': timestamp
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
        self.monitors.clear()
        self.history.clear()
        self.alerts.clear()
