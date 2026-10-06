import unittest
import numpy as np
from backend.radar.cluster import compute_novelty, cluster_trajectories
from backend.radar.drift import StreamingRadarDriftDetector


class TestScamRadar(unittest.TestCase):
    def test_novelty_score_known_family(self):
        # Digital arrest vector: authority(0), threat(2), isolation(3), payment(9)
        vec = np.zeros(64, dtype=np.float32)
        vec[0] = 0.9
        vec[2] = 0.9
        vec[3] = 0.8
        vec[9] = 0.7
        res = compute_novelty(vec)
        self.assertIn('Digital Arrest', res['closest_known_family'])
        self.assertGreater(res['similarity_to_known'], 0.5)

    def test_novelty_score_unknown_workflow(self):
        # Synthetic novel combination far from baseline
        vec = np.zeros(64, dtype=np.float32)
        vec[15] = 0.9
        vec[38] = 0.85
        res = compute_novelty(vec)
        self.assertGreaterEqual(res['novelty_score'], 0.5)
        self.assertTrue(res['is_novel'])

    def test_hdbscan_clustering_groups_emerging_reports(self):
        # Generate 5 reports with identical novel 64-d trajectory
        novel_vec = [0.0] * 64
        novel_vec[14] = 0.8
        novel_vec[28] = 0.9
        novel_vec[45] = 1.0

        reports = []
        for i in range(5):
            # small perturbation
            v = list(novel_vec)
            v[14] += (i * 0.01)
            reports.append({
                'session_id': f'novel-session-{i}',
                'trajectory': v,
                'tactics': ['authority', 'payment'],
                'channels': ['message', 'payment']
            })

        res = cluster_trajectories(reports)
        self.assertIn('clusters', res)
        self.assertEqual(res['total_evaluated'], 5)

    def test_river_adwin_detects_streaming_acceleration(self):
        detector = StreamingRadarDriftDetector(delta=0.01)
        # Low frequency baseline
        for _ in range(40):
            detector.observe('campaign-99', 0.02)
        # Sudden emergence burst
        drift_found = False
        for i in range(25):
            out = detector.observe('campaign-99', 1.0)
            if out['drift_detected']:
                drift_found = True
                break
        self.assertTrue(drift_found, "River ADWIN should flag sudden campaign emergence.")


if __name__ == '__main__':
    unittest.main()
