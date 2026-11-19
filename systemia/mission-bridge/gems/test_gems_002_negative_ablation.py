import unittest
import numpy as np
from gems_002_negative_ablation import sample_indices,train_only_distances

class NegativeAbalationTests(unittest.TestCase):
    def test_reproducible_and_buffered(self):
        labels=np.array([1,0,0,0,0,0,0,0,0,0],bool)
        train=np.ones(10,bool)
        distances=np.arange(10,dtype=float)
        a,ca=sample_indices(labels,train,distances,0)
        b,cb=sample_indices(labels,train,distances,0)
        np.testing.assert_array_equal(a,b)
        self.assertEqual(ca,cb)
        self.assertEqual(ca['sampled_negative_count'],5)
        c,cc=sample_indices(labels,train,distances,3)
        self.assertTrue(np.all(distances[c[1:]]>3))
        self.assertEqual(cc['sampled_negative_count'],5)

    def test_holdout_labels_never_influence_buffer(self):
        raw=np.zeros((5,5),np.int8)
        raw[1,1]=1
        raw[3,3]=1
        valid=np.ones((5,5),bool)
        train=np.ones(25,bool)
        train[3*5+3]=False
        original=train_only_distances(raw,valid,train)
        changed=raw.copy()
        changed[3,3]=0
        np.testing.assert_array_equal(original,train_only_distances(changed,valid,train))

    def test_sample_indices_only_from_training_mask(self):
        labels=np.array([1,0,0,0,1,0],bool)
        train=np.array([1,1,1,1,0,0],bool)
        distances=np.array([0,1,2,3,0,5],float)
        idx,_=sample_indices(labels,train,distances,0)
        self.assertTrue(np.all(train[idx]))
        self.assertTrue(np.all(idx<4))

    def test_unsafe_inputs_fail_closed(self):
        with self.assertRaises(ValueError):
            sample_indices([1,0],[1,1],[0,1],12)
        with self.assertRaises(ValueError):
            sample_indices([1,0],[1,1],[0,np.nan],0)
        with self.assertRaises(ValueError):
            sample_indices([0,0],[1,1],[2,3],0)

if __name__=='__main__':unittest.main()
