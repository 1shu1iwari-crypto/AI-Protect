# Optional PostHog contract

No collection token or connected workspace identifier is stored here. Configuration and user visit consent are both required. Request payloads are validated again server-side. No automatic events, DOM capture, recording SDK, identify call, person profile, sensitive free-text or durable identifier is used.

| Event | Trigger |
|---|---|
| scamguard_activated | User enables visit analytics after operator setup |
| check_completed | A user-submitted or fixed simulator event was checked; source/channel and intervention enums only |
| warning_suppressed | A repeated intervention was limited without lowering assessed risk |
| warning_shown | A new visible intervention is rendered |
| user_cancelled_payment | User cancels the simulated request |
| user_continued | User confirms simulated continuation |
| user_reported_scam | User shares a redacted workflow pattern |
| false_positive_feedback | User says the request appears legitimate |

Only `severity`, `stage`, coarse `latency_bucket`, `channel`, `source` and `intervention` enums can be sent. Source is `user_check`, `synthetic_scam` or `synthetic_benign`; real user checks are never assigned a truth label. The server adds `$process_person_profile: false` and `$geoip_disable: true`. No true/false label is inferred from feedback; a labelled consented test study is needed to measure real false interruptions. Warning events alone cannot establish actual money saved, detection accuracy or alert burden per legitimate session.

PostHog public capture API: https://posthog.com/docs/api/capture#single-event
Anonymous events: https://posthog.com/docs/product-analytics/capture-events#advanced-anonymous-vs-identified-events

The connected consent-only board is [ScamGuard — Warning outcomes](https://us.posthog.com/project/642009/dashboard/2162582). It is ready for explicit events; no activity is fabricated or sent by development QA. Configure your project capture token on the operator machine, then a user must opt in for that visit.

Synthetic test metrics are in evaluation/results.json. Production analytics and safety benchmarks are different evidence sources.
