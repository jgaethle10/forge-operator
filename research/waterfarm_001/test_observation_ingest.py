import unittest
from datetime import date
from observation_ingest import load_csv
from daily_storage import Model, simulate


class TestObservationIngest(unittest.TestCase):
    def setUp(self):
        self.start, self.end = date(2025, 1, 1), date(2025, 1, 3)
        self.csv = 'STATION,DATE,PRCP\nUSW00024243,2025-01-01,5\nUSW00024243,2025-01-02,0\nUSW00024243,2025-01-03,1.2\n'
        self.demand = {date(2025, 1, d): 100 for d in [1, 2, 3]}

    def load(self, text=None, **kw):
        args = dict(station='USW00024243', start=self.start, end=self.end, prcp_units='mm')
        args.update(kw)
        return load_csv(self.csv if text is None else text, self.demand, **args)

    def test_valid_and_receipt(self):
        readings, receipt = self.load()
        self.assertEqual(len(readings), 3)
        self.assertAlmostEqual(receipt.precipitation_total_mm, 6.2)
        self.assertEqual(len(receipt.text_sha256), 64)
        self.assertIn('UNVERIFIED', receipt.evidence_status)
        sim = simulate(readings, Model(100, 1000, .8, eligible_roof_and_site_approved=True,
                                       nonpotable_delivery_approved=True))
        self.assertAlmostEqual(sim.admitted_roof_l, 496)

    def test_missing_daily_row_is_hold(self):
        text = self.csv.replace('USW00024243,2025-01-02,0\n', '')
        with self.assertRaises(ValueError): self.load(text)

    def test_station_mismatch_is_hold(self):
        with self.assertRaises(ValueError): self.load(self.csv.replace('USW00024243,2025-01-02', 'USW00000000,2025-01-02'))

    def test_nonnumeric_missing_trace_and_nan_hold(self):
        for bad in ('', 'T', 'M', '-0.1', 'nan', 'inf'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.load(self.csv.replace('2025-01-02,0\n', f'2025-01-02,{bad}\n'))

    def test_units_must_be_metric_explicit(self):
        with self.assertRaises(ValueError): self.load(prcp_units='inches')

    def test_bad_header_and_out_of_range_hold(self):
        with self.assertRaises(ValueError): self.load(self.csv.replace('PRCP', 'RAIN'))
        with self.assertRaises(ValueError): self.load(self.csv + 'USW00024243,2025-01-04,0\n')

    def test_duplicate_day_hold(self):
        with self.assertRaises(ValueError): self.load(self.csv + 'USW00024243,2025-01-02,0\n')

    def test_missing_customer_demand_hold(self):
        del self.demand[date(2025, 1, 2)]
        with self.assertRaises(ValueError): self.load()


if __name__ == '__main__':
    unittest.main()
