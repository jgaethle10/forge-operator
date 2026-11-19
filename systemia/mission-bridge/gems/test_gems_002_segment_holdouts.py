import unittest
import numpy as np
from gems_002_segment_holdouts import split_connected_faults,masks_for_fold

class ConnectedFaultHoldoutTests(unittest.TestCase):
    @staticmethod
    def fixture():
        valid=np.ones((130,160),bool)
        raw=np.zeros(valid.shape,np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),
                        (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1
        return raw,valid
    def test_deterministic_disjoint_whole_components(self):
        raw,valid=self.fixture()
        a=split_connected_faults(raw,valid,100)
        b=split_connected_faults(raw,valid,100)
        self.assertEqual(a[1],b[1])
        self.assertEqual(len(a[1]),3)
        self.assertEqual(len(set(sum(a[1],[]))),len(sum(a[1],[])))
        self.assertGreaterEqual(a[3]["excluded_crossing_south"],1)
    def test_whole_trace_and_buffer_excluded_from_fit(self):
        raw,valid=self.fixture()
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        for split in splits:
            train,test,truth,meta=masks_for_fold(groups,split,valid,100,5,3)
            segment=np.isin(groups,split)
            self.assertFalse(np.any(segment&train))
            self.assertFalse(np.any(train&test))
            self.assertTrue(np.array_equal(segment,truth))
            self.assertFalse(np.any(truth[100:]))
            self.assertEqual(meta["heldout_positive_pixels"],int(segment.sum()))
    def test_nearby_unheldout_faults_not_treated_as_negatives(self):
        raw,valid=self.fixture()
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        _,region,_,_=masks_for_fold(groups,splits[0],valid,100,5,3)
        other=(groups>0)&~np.isin(groups,splits[0])
        self.assertFalse(np.any(region&other))
    def test_invalid_inputs_hold(self):
        raw,valid=self.fixture()
        with self.assertRaises(ValueError):split_connected_faults(raw,valid[:,:-1],100)
        with self.assertRaises(ValueError):split_connected_faults(raw,valid,0)
        with self.assertRaises(ValueError):split_connected_faults(raw,valid,100,min_trace=10000)
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        with self.assertRaises(ValueError):masks_for_fold(groups,splits[0],valid,100,3,5)
if __name__=="__main__":unittest.main()
