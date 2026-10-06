"""Scam Radar: Unsupervised Density Clustering with HDBSCAN on 64-d Trajectory Vectors.

Discovers previously unseen, zero-day scam campaigns from anonymized mathematical
journey vectors without collecting user messages, audio, or account identifiers.
"""
import json
from pathlib import Path
import numpy as np
from sklearn.cluster import HDBSCAN
from sklearn.metrics.pairwise import cosine_similarity

# RBI BE(A)WARE Canonical Baseline Trajectories (SG01 to SG12)
# Reference vectors in R^64 representing established Indian fraud architectures.
RBI_BASELINE_CENTROIDS = {
    'SG01_digital_arrest': {
        'family': 'Digital Arrest / Official Impersonation',
        'code': 'SG01',
        'dominant_tactics': ['authority', 'threat', 'isolation', 'payment'],
        # High authority (dim 0), threat (dim 2), isolation (dim 3), payment (dim 9), coercion (dim 13)
        'prototype_indices': {0: 0.9, 2: 0.9, 3: 0.8, 9: 0.7, 13: 1.0, 21: 0.5, 22: 0.5, 58: 1.0, 59: 1.0, 62: 1.0}
    },
    'SG02_refund_reversal': {
        'family': 'Refund / QR Intent Mismatch',
        'code': 'SG02',
        'dominant_tactics': ['refund', 'payment'],
        # Refund (dim 7), payment (dim 9), QR (dim 24), credit_vs_debit contradiction (dim 42)
        'prototype_indices': {7: 0.9, 9: 0.9, 21: 0.4, 24: 0.6, 30: 1.0, 42: 1.0, 46: 1.0, 58: 1.0, 59: 1.0, 62: 0.9}
    },
    'SG03_remote_access': {
        'family': 'Remote Access Support',
        'code': 'SG03',
        'dominant_tactics': ['authority', 'remote_access'],
        # Authority (dim 0), remote_access (dim 5), remote action contradiction (dim 43)
        'prototype_indices': {0: 0.8, 5: 1.0, 21: 0.5, 22: 0.5, 43: 1.0, 58: 1.0, 60: 1.0, 62: 0.9}
    },
    'SG04_fake_kyc': {
        'family': 'Fake KYC Threat / Link',
        'code': 'SG04',
        'dominant_tactics': ['verification', 'threat', 'urgency', 'link_risk'],
        # Urgency (dim 1), threat (dim 2), verification (dim 11), link_risk (dim 12), link (dim 23)
        'prototype_indices': {1: 0.8, 2: 0.8, 11: 0.9, 12: 0.9, 23: 0.6, 58: 0.5, 62: 0.8}
    },
    'SG05_credential_theft': {
        'family': 'Secret Credential Harvesting',
        'code': 'SG05',
        'dominant_tactics': ['credentials', 'urgency'],
        # Urgency (dim 1), credentials (dim 4), sensitive action (dim 58)
        'prototype_indices': {1: 0.9, 4: 1.0, 21: 0.8, 58: 1.0, 62: 0.9}
    },
    'SG06_investment_ponzi': {
        'family': 'Investment Escalation / Ponzi',
        'code': 'SG06',
        'dominant_tactics': ['investment', 'payment'],
        # Investment (dim 6), payment (dim 9), escalating (dim 50), multi-payment (dim 51)
        'prototype_indices': {6: 0.9, 9: 0.9, 46: 1.0, 47: 0.8, 50: 1.0, 51: 1.0, 58: 1.0, 59: 1.0, 62: 0.8}
    },
    'SG07_task_advance_fee': {
        'family': 'Task / Advance Fee Unlock',
        'code': 'SG07',
        'dominant_tactics': ['fee', 'payment'],
        # Fee (dim 8), payment (dim 9), reward (dim 17), investment contradiction (dim 44)
        'prototype_indices': {8: 0.9, 9: 0.9, 17: 1.0, 44: 1.0, 46: 1.0, 58: 1.0, 59: 1.0, 62: 0.8}
    }
}


def build_centroid_vector(prototype_indices):
    vec = np.zeros(64, dtype=np.float32)
    for idx, val in prototype_indices.items():
        vec[idx] = val
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


PRECOMPUTED_CENTROIDS = {k: build_centroid_vector(v['prototype_indices']) for k, v in RBI_BASELINE_CENTROIDS.items()}
BASELINE_FILE = Path(__file__).parent / 'baseline_vectors.json'
if BASELINE_FILE.exists():
    try:
        raw_baselines = json.loads(BASELINE_FILE.read_text(encoding='utf-8'))
        for name, data in raw_baselines.items():
            vec = np.array(data['vector'], dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                PRECOMPUTED_CENTROIDS[name] = vec / norm
                RBI_BASELINE_CENTROIDS[name] = {'family': data['family'], 'code': name.upper()}
    except Exception:
        pass


def compute_novelty(trajectory_vec):
    """Computes similarity of a 64-d vector against all known RBI baseline centroids."""
    vec = np.array(trajectory_vec, dtype=np.float32).reshape(1, -1)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    best_sim = 0.0
    best_family = 'Unknown'
    best_code = 'NOVEL'

    for name, c_vec in PRECOMPUTED_CENTROIDS.items():
        sim = float(cosine_similarity(vec, c_vec.reshape(1, -1))[0][0])
        if sim > best_sim:
            best_sim = sim
            best_family = RBI_BASELINE_CENTROIDS[name]['family']
            best_code = RBI_BASELINE_CENTROIDS[name]['code']

    novelty_score = max(0.0, 1.0 - best_sim)
    return {
        'closest_known_family': best_family,
        'closest_code': best_code,
        'similarity_to_known': round(best_sim, 4),
        'novelty_score': round(novelty_score, 4),
        'is_novel': novelty_score >= 0.35
    }


def cluster_trajectories(reports):
    """Clusters trajectory vectors using HDBSCAN to discover emerging campaigns."""
    if not reports or len(reports) < 2:
        return {'clusters': [], 'noise_count': len(reports), 'novel_campaigns': []}

    vectors = []
    valid_reports = []
    for r in reports:
        traj = r.get('trajectory')
        if traj and len(traj) == 64:
            vectors.append(traj)
            valid_reports.append(r)

    if len(vectors) < 2:
        return {'clusters': [], 'noise_count': len(reports), 'novel_campaigns': []}

    X = np.array(vectors, dtype=np.float32)
    # Cosine distance matrix
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    X_norm = X / norms
    dist_matrix = 1.0 - np.clip(np.dot(X_norm, X_norm.T), -1.0, 1.0)
    np.fill_diagonal(dist_matrix, 0.0)

    # Use HDBSCAN with precomputed distance
    min_size = min(3, max(2, len(vectors) // 3))
    try:
        clusterer = HDBSCAN(min_cluster_size=min_size, metric='precomputed', allow_single_cluster=True, copy=True)
        labels = clusterer.fit_predict(dist_matrix.astype(np.float64))
    except Exception:
        labels = np.array([-1] * len(vectors))

    clusters = {}
    for idx, label in enumerate(labels):
        rep = valid_reports[idx]
        novelty_info = compute_novelty(vectors[idx])
        if label not in clusters:
            clusters[label] = {
                'cluster_id': int(label),
                'is_noise': label == -1,
                'reports': [],
                'vectors': [],
                'novelty_scores': []
            }
        clusters[label]['reports'].append(rep)
        clusters[label]['vectors'].append(vectors[idx])
        clusters[label]['novelty_scores'].append(novelty_info['novelty_score'])

    result_clusters = []
    novel_campaigns = []

    for cid, cdata in clusters.items():
        if cid == -1:
            continue
        c_vecs = np.array(cdata['vectors'])
        centroid = np.mean(c_vecs, axis=0)
        c_novelty = compute_novelty(centroid)
        is_emerging_novelty = c_novelty['novelty_score'] >= 0.35 and len(cdata['reports']) >= 2

        cluster_summary = {
            'cluster_id': int(cid),
            'size': int(len(cdata['reports'])),
            'mean_novelty': round(float(np.mean(cdata['novelty_scores'])), 4),
            'closest_known': str(c_novelty['closest_known_family']),
            'similarity_to_known': round(float(c_novelty['similarity_to_known']), 4),
            'is_emerging_novelty': is_emerging_novelty,
            'status': 'EMERGING_NOVELTY' if is_emerging_novelty else 'KNOWN_FAMILY_CLUSTER',
            'session_ids': [r.get('session_id') for r in cdata['reports']]
        }
        result_clusters.append(cluster_summary)
        if is_emerging_novelty:
            novel_campaigns.append(cluster_summary)

    return {
        'clusters': result_clusters,
        'novel_campaigns': novel_campaigns,
        'noise_count': len(clusters.get(-1, {}).get('reports', [])),
        'total_evaluated': len(valid_reports)
    }
