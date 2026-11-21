"""WATERFARM-001: import supplied dated precipitation records without filling gaps.

Accepted input: NOAA Daily Summaries-style CSV (STATION, DATE, PRCP). Requires
explicit declaration that the download used metric units, where PRCP is mm.
This importer does NOT download or authenticate the external source, adjudicate
NOAA QC flags, transform snowfall to liquid capture, or grant reuse rights.
"""
import csv
from dataclasses import dataclass
from datetime import date, timedelta
from hashlib import sha256
from io import StringIO
from math import isfinite
from typing import Mapping
from daily_storage import Day, number


@dataclass(frozen=True)
class IngestReceipt:
    station: str
    first_day: date
    last_day: date
    record_count: int
    precipitation_total_mm: float
    text_sha256: str
    evidence_status: str


def load_csv(text: str, demand_by_date: Mapping[date, float], *,
             station: str, start: date, end: date, prcp_units: str) -> tuple[tuple[Day, ...], IngestReceipt]:
    """Reject bad/missing days, ambiguous numeric or trace codes and station mismatch.

    evidence_status stays unverified regardless of a user-supplied source claim.
    """
    if prcp_units != 'mm':
        raise ValueError('require explicit NOAA metric precipitation (mm)')
    if not isinstance(text, str) or not text.strip():
        raise ValueError('empty data: HOLD')
    if not isinstance(start, date) or not isinstance(end, date) or end < start:
        raise ValueError('bad date range')
    if not isinstance(station, str) or not station.strip():
        raise ValueError('station is required')
    fields = csv.DictReader(StringIO(text))
    if not fields.fieldnames or not {'STATION', 'DATE', 'PRCP'}.issubset(set(fields.fieldnames)):
        raise ValueError('required CSV columns STATION, DATE, PRCP missing')
    found = {}
    for row in fields:
        if None in row or row['STATION'] != station:
            raise ValueError('row malformed or source station mismatch: HOLD')
        try:
            d = date.fromisoformat(row['DATE'])
        except (TypeError, ValueError):
            raise ValueError('invalid date: HOLD') from None
        if not start <= d <= end or d in found:
            raise ValueError('out of range or duplicate date: HOLD')
        try:
            val = float(row['PRCP'])
        except (TypeError, ValueError):
            raise ValueError('missing, trace or nonnumeric precipitation: HOLD') from None
        number('PRCP in mm', val)
        found[d] = val
    out = []
    day = start
    while day <= end:
        if day not in found or day not in demand_by_date:
            raise ValueError('missing precipitation or site demand: HOLD')
        out.append(Day(day, found[day], number('daily demand', demand_by_date[day])))
        day += timedelta(days=1)
    receipt = IngestReceipt(station, start, end, len(out), sum(x.precipitation_mm for x in out),
                           sha256(text.encode('utf-8')).hexdigest(),
                           'SUPPLIED_CSV_UNVERIFIED_NOAA_OR_QC')
    return tuple(out), receipt
