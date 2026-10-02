"""Order-aware, unverified campaign candidates from enum-only fingerprints.

The two fixed 20-report windows expose a distribution-shift signal. Its
Hoeffding bound assumes independent observations; session IDs do not prove
independent reporters. This is an analyst cue, never an automatic fraud label.
"""
import hashlib
import json
import math

WINDOW = 20


def compact(sequence):
    result = []
    for tactic in sequence:
        if not result or tactic != result[-1]:
            result.append(tactic)
    return result


def ordered_similarity(a, b):
    """Normalized longest common subsequence, bounded to 64 tactics."""
    a, b = compact(a), compact(b)
    previous = [0] * (len(b) + 1)
    for x in a:
        row = [0]
        for j, y in enumerate(b):
            row.append(previous[j] + 1 if x == y else max(previous[j + 1], row[-1]))
        previous = row
    return previous[-1] / max(1, len(a), len(b))


def shift_signal(members, total, groups):
    if total < WINDOW * 2:
        return {'enough_data': False, 'detected': False, 'window_size': WINDOW}
    start = total - WINDOW * 2
    baseline = sum(start <= i < total - WINDOW for i in members)
    recent = sum(total - WINDOW <= i < total for i in members)
    # Bonferroni adjustment for the candidate comparisons in this snapshot.
    delta = 0.01 / max(1, groups)
    bound = math.sqrt(0.5 * math.log(2 / delta) * (2 / WINDOW))
    change = (recent - baseline) / WINDOW
    return {'enough_data': True, 'detected': change > bound,
            'window_size': WINDOW, 'baseline_count': baseline,
            'recent_count': recent, 'change': round(change, 3),
            'bound': round(bound, 3), 'assumption': 'independent reports; not verified'}


def known_composition(tactics):
    patterns = [({'refund', 'payment'}, 'Refund reversal'),
                ({'investment', 'payment'}, 'Investment solicitation'),
                ({'authority', 'threat', 'payment'}, 'Authority pressure'),
                ({'fee', 'payment'}, 'Advance fee'),
                ({'verification', 'link_risk'}, 'Verification lure'),
                ({'credentials'}, 'Credential request')]
    for required, name in patterns:
        if required <= tactics:
            return name
    return 'Unmapped tactic composition'


def discover(rows, reviews, now):
    groups = []
    for index, (created, raw) in enumerate(rows):
        p = json.loads(raw)
        tactics = set(p['tactics'])
        if len(tactics - {'payment', 'urgency'}) < 2:
            continue
        sequence = compact(p['sequence'])
        match = None
        for g in groups:
            jaccard = len(tactics & g['tactics']) / max(1, len(tactics | g['tactics']))
            if jaccard >= .70 and ordered_similarity(sequence, g['sequence']) >= .70:
                match = g
                break
        if match is None:
            signature = hashlib.sha256(json.dumps([sorted(tactics), sequence]).encode()).hexdigest()[:24]
            match = {'signature': signature, 'tactics': tactics, 'sequence': sequence,
                     'reports': 0, 'first_seen': created, 'last_seen': created,
                     'recent': 0, 'channels': set(), 'members': [], 'discovered_at': None}
            groups.append(match)
        match['reports'] += 1
        match['members'].append(index)
        match['channels'].update(p['channels'])
        match['last_seen'] = created
        match['recent'] += int(created > now - 300)
        if match['reports'] == 3:
            match['discovered_at'] = created
    result = []
    for g in groups:
        if g['reports'] < 3:
            continue
        result.append({k: v for k, v in g.items() if k not in {'members', 'tactics', 'channels'}} | {
            'tactics': sorted(g['tactics']), 'channels': sorted(g['channels']),
            'status': reviews.get(g['signature'], 'candidate'),
            'burst_candidate': g['recent'] >= 3,
            'composition': known_composition(g['tactics']),
            'shift': shift_signal(g['members'], len(rows), len(groups)),
            'seconds_to_candidate': max(0, g['discovered_at'] - g['first_seen']),
            'method': 'Tactic Jaccard + ordered LCS; two-window Hoeffding shift cue',
            'trusted_reporters_verified': False,
        })
    return sorted(result, key=lambda g: (g['shift']['detected'], g['last_seen']), reverse=True)
