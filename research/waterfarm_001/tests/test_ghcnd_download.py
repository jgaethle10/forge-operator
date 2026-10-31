import io
import json
import tempfile
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'noaa'))
from ghcnd_source import STATION, DataHold, download_station
from test_ghcnd_source import fixture

class FakeResponse:
    def __init__(self, body, final_url='https://www.ncei.noaa.gov/pub/data/ghcn/daily/all/USW00024243.dly'):
        self.contents=io.BytesIO(body)
        self.url=final_url
        self.headers={'ETag':'"synthetic"','Last-Modified':'Mon, 01 Jan 2001 00:00:00 GMT'}
    def read(self,n):return self.contents.read(n)
    def geturl(self):return self.url
    def __enter__(self):return self
    def __exit__(self,*a):return False

class DownloadSecurityTests(unittest.TestCase):
    def test_mock_official_receipt_and_hash(self):
        data=fixture()
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'station.dly'
            with patch('ghcnd_source.urlopen',return_value=FakeResponse(data)):
                receipt=download_station(path)
            self.assertEqual(path.read_bytes(),data)
            self.assertEqual(receipt['bytes'],len(data))
            self.assertIn('QC_NOT_VALIDATED',receipt['status'])
            self.assertEqual(json.loads(path.with_suffix('.receipt.json').read_text())['sha256'],receipt['sha256'])

    def test_untrusted_redirect_fails_before_write(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'station.dly'
            with patch('ghcnd_source.urlopen',return_value=FakeResponse(fixture(), 'https://untrusted.invalid/evil.dly')):
                with self.assertRaises(DataHold):download_station(path)
            self.assertFalse(path.exists())

    def test_wrong_payload_refused(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'station.dly'
            with patch('ghcnd_source.urlopen',return_value=FakeResponse(b'ERROR,UPSTREAM,UNAVAILABLE')):
                with self.assertRaises(DataHold):download_station(path)
            self.assertFalse(path.exists())

if __name__ == '__main__':unittest.main()
