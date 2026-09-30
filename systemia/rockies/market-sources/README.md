# Rockies SEC Market Field Pack

The SEC field pack turns official EDGAR filing metadata into timestamped Rockies observations for market research.

It currently covers a bounded DayTrade research universe and forms 8-K, 10-Q and 10-K.

## Timestamp discipline

EDGAR acceptance time is preserved separately from the time Edge Lab is allowed to treat the filing as observable.

Because the SEC says filings are often available on sec.gov within 1–3 minutes of the EDGAR system timestamp but does not guarantee that lag, the field pack currently adds a 10-minute publication-delay buffer before setting the Rocky observation timestamp.

That buffer is explicitly modeled metadata:

- `sec_acceptance_at`
- `market_observation_time_basis=sec_acceptance_plus_publication_delay_buffer`
- `publication_delay_buffer_minutes=10`
- `public_availability_exact_time_known=false`

The research engine therefore does not claim that the exact public availability timestamp is known.

## Source discipline

- source system: Rockies
- source family: SEC filings
- authority: official SEC EDGAR metadata
- evidence state: verified filing occurrence
- direction: not inferred
- direct market symbol: issuer ticker from the SEC ticker map
- filing provenance: EDGAR archive document URL

The SEC field pack does not interpret filing text and does not infer whether a filing is good or bad news.

## Fair access

Automated SEC requests identify the Evercraft research client and are deliberately rate-limited below the SEC's published automated access ceiling.

## Execution boundary

This pack creates observations and research artifacts only. It cannot place, modify or cancel trades.


## Current research depth

The SEC market field pack uses a rolling **365-day** lookback and a deliberately multi-issuer research universe across semiconductors/compute, AI/software, industrial manufacturing and independent-scout controls.

For official regulatory observations, Edge Lab records the SEC source family separately from the issuer origin entity. This lets the research layer demand issuer diversity without pretending that multiple companies are multiple regulatory authorities.

Long Alpaca historical windows are paginated until the dataset is complete within the configured safety ceiling.
