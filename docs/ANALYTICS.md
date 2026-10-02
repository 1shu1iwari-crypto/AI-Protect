# Optional PostHog contract

No collection token or connected workspace identifier is stored here. Configuration and user visit consent are both required. Request payloads are validated again server-side. No automatic events, DOM capture, recording SDK, identify call, person profile, sensitive free-text or durable identifier is used.

| Event | Trigger |
|---|---|
| scamguard_activated | User enables visit analytics after operator setup |
| warning_shown | A new visible intervention is rendered |
| user_cancelled_payment | User cancels the simulated request |
| user_continued | User confirms simulated continuation |
| user_reported_scam | User shares a redacted workflow pattern |
| false_positive_feedback | User says the request appears legitimate |

Only `severity`, `stage` and a coarse `latency_bucket` can be sent. The server adds `$process_person_profile: false` and `$geoip_disable: true`. No true/false label is inferred from feedback; a labelled consented test study is needed to measure real false interruptions. Warning events alone cannot establish actual money saved, detection accuracy or alert burden per legitimate session.

PostHog public capture API: https://posthog.com/docs/api/capture#single-event
Anonymous events: https://posthog.com/docs/product-analytics/capture-events#advanced-anonymous-vs-identified-events

Synthetic test metrics are in evaluation/results.json. Production analytics and safety benchmarks are different evidence sources.
