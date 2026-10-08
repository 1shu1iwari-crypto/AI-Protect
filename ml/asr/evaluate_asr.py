"""Score actual original-language ASR outputs. This script does not create recordings.

Input JSONL: id, language, reference, hypothesis, model, and optional critical_terms,
latency_ms, device. Keep licensed audio/transcripts outside git. No reference/hypothesis
is copied into the output report.
"""
import argparse
import json
import unicodedata
from collections import defaultdict
from pathlib import Path


def normalize(text):
    return ' '.join(unicodedata.normalize('NFKC', text).lower().split())


def edit_distance(reference, hypothesis):
    row = list(range(len(hypothesis) + 1))
    for i, token in enumerate(reference, 1):
        next_row = [i]
        for j, other in enumerate(hypothesis, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j-1] + (token != other)))
        row = next_row
    return row[-1]


def evaluate(rows):
    groups = defaultdict(lambda: dict(samples=0, word_errors=0, reference_words=0,
        character_errors=0, reference_characters=0, critical_present=0, critical_preserved=0, latency_ms=[]))
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not all(isinstance(row.get(key), str) and row[key] for key in ('id', 'language', 'model', 'reference')):
            raise ValueError('Each row needs id, language, model and a non-empty reference.')
        if not isinstance(row.get('hypothesis'), str):
            raise ValueError('Each row needs an actual ASR hypothesis (empty output is allowed).')
        identity = (row['id'], row['model'])
        if identity in seen:
            raise ValueError('Duplicate recording/model pair.')
        seen.add(identity)
        reference, hypothesis = normalize(row['reference']), normalize(row['hypothesis'])
        result = groups[(row['model'], row['language'])]
        result['samples'] += 1
        result['word_errors'] += edit_distance(reference.split(), hypothesis.split())
        result['reference_words'] += len(reference.split())
        result['character_errors'] += edit_distance(reference, hypothesis)
        result['reference_characters'] += len(reference)
        for term in row.get('critical_terms', []):
            if not isinstance(term, str) or not term.strip():
                raise ValueError('critical_terms must contain non-empty original-language strings.')
            term = normalize(term)
            if term in reference:
                result['critical_present'] += 1
                result['critical_preserved'] += int(term in hypothesis)
        latency = row.get('latency_ms')
        if latency is not None:
            if not isinstance(latency, (int, float)) or latency < 0:
                raise ValueError('latency_ms must be non-negative.')
            result['latency_ms'].append(latency)
    if not groups:
        raise ValueError('No actual ASR outputs were supplied.')
    output = []
    for (model, language), stats in sorted(groups.items()):
        latencies = sorted(stats.pop('latency_ms'))
        output.append(dict(model=model, language=language, **stats,
            wer=stats['word_errors'] / max(1, stats['reference_words']),
            cer=stats['character_errors'] / max(1, stats['reference_characters']),
            critical_term_preservation=stats['critical_preserved'] / stats['critical_present'] if stats['critical_present'] else None,
            latency_p50_ms=latencies[len(latencies)//2] if latencies else None,
            latency_p95_ms=latencies[min(len(latencies)-1, int(len(latencies)*.95))] if latencies else None))
    return dict(schema_version=1, groups=output,
        limitations=['WER/CER do not establish scam-detection accuracy.',
                     'Critical-term substring retention is an aid, not semantic or negation validation.',
                     'No representative real-call accuracy is claimed by this script.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with args.manifest.open(encoding='utf-8') as source:
        result = evaluate([json.loads(line) for line in source if line.strip()])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Scored actual ASR outputs; original speech was omitted from the report.')
