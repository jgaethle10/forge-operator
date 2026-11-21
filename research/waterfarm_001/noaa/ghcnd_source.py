"""Evercraft Aqua RC04: strict NOAA GHCN-Daily fixed-width precipitation ingestion.

Research preflight only; parses bytes provided by the operator and documents quality.
Does not validate NOAA server identity for offline input and does not certify capture
volume, water quality, tank sizing, crop demand, climate suitability or grants.

Format source: NOAA GHCN-Daily README v3.35 (2026-10-05), section III.
https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt
Station: YAKIMA AIRPORT WA / USW00024243.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
from hashlib import sha256
from pathlib import Path
import argparse
import csv
import io
import json
import os
import re
import tempfile
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

STATION = 'USW00024243'
README_URL = 'https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt'
SOURCE_URL = 'https://www.ncei.noaa.gov/pub/data/ghcn/daily/all/USW00024243.dly'
MAX_BYTES = 12_000_000
MFLAG_SUPPORTED = set(' ABCDEFG')


class DataHold(ValueError):
    """Not suitable for a water-design estimate until reviewed."""


@dataclass(frozen=True)
class Observation:
    day: str
    prcp_mm: float | None
    status: str
    mflag: str
    qflag: str
    sflag: str


@dataclass(frozen=True)
class Intake:
    station: str
    year: int
    raw_sha256: str
    source_bytes: int
    days_expected: int
    days_clear: int
    days_held: int
    precipitation_mm_if_all_clear: float | None
    status: str
    days: tuple[Observation, ...]
    cautions: tuple[str, ...]


def parse_station(text: bytes, *, year: int, station: str = STATION) -> Intake:
    """Strictly parse PRCP; report every missing/flagged calendar day explicitly.

    MFLAG A-G represent documented types of daily summarized rainfall and are
    included for research but may require expert review for timing relevance.
    MFLAG H/I/P/T and any QFLAG are HOLD; MDPR is not allocated to days.
    Valid zeros alone are zero, missing observations are never filled with zero.
    """
    if type(year) is not int or not (1900 <= year <= 2100):
        raise ValueError('year must be an integer between 1900 and 2100')
    if not re.fullmatch(r'[A-Z0-9]{11}', station):
        raise ValueError('invalid station identifier')
    if not isinstance(text, bytes) or not text or len(text) > MAX_BYTES:
        raise DataHold('station download missing or outside size bounds')
    try:
        lines = text.decode('ascii').splitlines()
    except UnicodeError as e:
        raise DataHold('non-ASCII data: HOLD') from e
    records: dict[date, Observation] = {}
    in_year_prcp_months: set[int] = set()
    saw_station = False
    for n, line in enumerate(lines, start=1):
        if len(line) != 269:
            raise DataHold(f'bad GHCN fixed-width row {n}: expected 269 characters')
        if line[:11] != station:
            raise DataHold(f'wrong station at row {n}')
        saw_station = True
        try:
            row_year, month = int(line[11:15]), int(line[15:17])
            if not 1 <= month <= 12:
                raise ValueError('invalid month')
        except ValueError as e:
            raise DataHold(f'bad year/month at row {n}') from e
        element = line[17:21]
        if element != 'PRCP' or row_year != year:
            continue
        if month in in_year_prcp_months:
            raise DataHold(f'duplicate PRCP month {month}, year {year}')
        in_year_prcp_months.add(month)
        for d in range(1, 32):
            try:
                day = date(year, month, d)
            except ValueError:
                continue  # Padding slots in fixed-width record are not days.
            pos = 21 + 8*(d - 1)
            v = line[pos:pos + 5]
            mflag, qflag, sflag = line[pos + 5], line[pos + 6], line[pos + 7]
            try:
                raw = int(v)
            except ValueError as e:
                raise DataHold(f'non-integer precipitation field at {day.isoformat()}') from e
            reasons = []
            if raw == -9999:
                reasons.append('MISSING')
            elif raw < 0:
                reasons.append('NEGATIVE_VALUE')
            if qflag.strip():
                reasons.append('FAILED_QC')
            if mflag not in MFLAG_SUPPORTED:
                reasons.append('MEASUREMENT_FLAG_REVIEW')
            if sflag == ' ' and raw != -9999:
                reasons.append('NO_SOURCE')
            # Include genuine zero observations but never guessed 0.
            status = '+'.join(reasons) if reasons else 'CLEAR'
            records[day] = Observation(day.isoformat(), raw / 10 if status == 'CLEAR' else None,
                                       status, mflag.strip(), qflag.strip(), sflag.strip())
    if not saw_station:
        raise DataHold('station not found in supplied data')
    first = date(year, 1, 1)
    end = date(year + 1, 1, 1)
    current = first
    days = []
    while current < end:
        days.append(records.get(current, Observation(current.isoformat(), None, 'NO_PRCP_RECORD', '', '', '')))
        current += timedelta(days=1)
    clear = sum(x.status == 'CLEAR' for x in days)
    fully_clear = clear == len(days)
    return Intake(station, year, sha256(text).hexdigest(), len(text), len(days), clear,
                  len(days) - clear, round(sum(x.prcp_mm for x in days if x.prcp_mm is not None), 5)
                  if fully_clear else None, 'COMPLETE_QC_SCREEN_SOURCE_AUTHENTICITY_UNVERIFIED'
                  if fully_clear else 'HOLD_DAILY_PRECIPITATION_INCOMPLETE', tuple(days),
                  ('Structural and value/flag screening only; NOAA authenticity requires a verified source receipt.',
                   'Daily station precip includes rain and melted snow but does not equal same-day usable runoff.',
                   'Reported day may differ from the time of actual precipitation; consult station observation time.',
                   'GHCN-Daily quality controls and recent records can be revised after publication.',
                   'Station precipitation is not a site rainfall gauge or a greenhouse water-demand measurement.'))


def publish_review(intake: Intake, output_dir: Path) -> tuple[Path, Path | None]:
    """Always save QC JSON. Only emit model-ready CSV if all dates pass QC.

    Filename includes raw source SHA prefix; no mutable unversioned clean CSV alias.
    A passing CSV is source-UNAUTHENTICATED until official download receipt reviewed.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    report = output_dir / f'{intake.station}_{intake.year}_{intake.raw_sha256[:12]}_qc.json'
    report.write_text(json.dumps(asdict(intake), indent=2) + '\n', encoding='utf-8')
    path = output_dir / f'{intake.station}_{intake.year}_{intake.raw_sha256[:12]}_unverified_daily_prcp.csv'
    if intake.days_held:
        path.unlink(missing_ok=True)
        return report, None
    with path.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.writer(stream)
        writer.writerow(['STATION', 'DATE', 'PRCP', 'RECORD_STATUS'])
        for day in intake.days:
            writer.writerow([intake.station, day.day, format(day.prcp_mm, '.1f'),
                             'QC_SCREENED_SOURCE_UNVERIFIED'])
    return report, path


def download_station(destination: Path) -> dict:
    """Opt-in single allowed NOAA station fetch, never runs automatically.

    No user identifiers or credentials in request; bounded size, TLS and atomic write.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    req = Request(SOURCE_URL, headers={'User-Agent': 'EvercraftAqua-Research/0.4'})
    with urlopen(req, timeout=25) as res:
        host = urlsplit(res.geturl()).hostname
        if host != 'www.ncei.noaa.gov':
            raise DataHold('download redirected outside official NOAA host')
        buf = bytearray()
        while True:
            block = res.read(65536)
            if not block:
                break
            buf.extend(block)
            if len(buf) > MAX_BYTES:
                raise DataHold('download exceeded fixed input size guard')
        payload = bytes(buf)
        # Validate before replacing an existing file. This checks layout only.
        if not payload or payload[:11] != STATION.encode('ascii') or len(payload.splitlines()[0]) != 269:
            raise DataHold('download does not match required NOAA station file layout')
        source_receipt = {'url': SOURCE_URL, 'retrieved_url': res.geturl(),
                          'station': STATION, 'sha256': sha256(payload).hexdigest(),
                          'bytes': len(payload), 'etag': res.headers.get('ETag'),
                          'last_modified': res.headers.get('Last-Modified'),
                          'status': 'DOWNLOADED_FROM_OFFICIAL_HTTPS_QC_NOT_VALIDATED'}
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as f:
        temp_name = f.name
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_name, destination)
    destination.with_suffix('.receipt.json').write_text(json.dumps(source_receipt, indent=2)+'\n')
    return source_receipt


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--input', type=Path, help='Existing NOAA USW00024243.dly source file')
    cli.add_argument('--download', action='store_true', help='Explicitly download from NOAA into --input')
    cli.add_argument('--year', type=int, default=2025)
    cli.add_argument('--output', type=Path, default=Path('qc'))
    opts = cli.parse_args()
    if not opts.input:
        cli.error('specify --input; no data are downloaded or synthesized by default')
    if opts.download:
        print(json.dumps(download_station(opts.input), indent=2))
    intake = parse_station(opts.input.read_bytes(), year=opts.year)
    report, clean = publish_review(intake, opts.output)
    print(json.dumps({'status': intake.status, 'clear': intake.days_clear,
                      'held': intake.days_held, 'qc_report': str(report),
                      'daily_csv': str(clean) if clean else None}, indent=2))
    if not clean:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
