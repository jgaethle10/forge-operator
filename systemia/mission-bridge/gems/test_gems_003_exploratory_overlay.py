import unittest
import numpy as np
from gems_003_exploratory_overlay import overlay
class ExploratoryOverlayTests(unittest.TestCase):
 def test_only_adds_nearby_high_confidence_cells(self):
  old=np.zeros((24,24),np.float32);new=np.zeros_like(old)
  old[10,10]=.3
  new[10,10]=.6
  new[10,13]=.8
  new[10,20]=.9
  result,added,_=overlay(old,new,.7,3)
  self.assertEqual(int(added.sum()),1)
  self.assertEqual(float(result[10,10]),float(old[10,10]))
  self.assertEqual(float(result[10,13]),float(new[10,13]))
  self.assertEqual(float(result[10,20]),0.)
 def test_retains_outside_nan_exactly(self):
  old=np.zeros((20,20),np.float32);new=np.zeros_like(old)
  old[:2,:2]=np.nan;new[:2,:2]=np.nan
  old[10,10]=.3;new[10,11]=.9
  result,added,_=overlay(old,new,.7,10)
  self.assertTrue(np.array_equal(np.isnan(result),np.isnan(old)))
  self.assertEqual(int(added.sum()),1)
 def test_rejects_mismatched_masks_and_values(self):
  old=np.zeros((8,8),np.float32);new=old.copy()
  new[0,0]=np.nan
  with self.assertRaisesRegex(ValueError,"valid_mask_mismatch"):
   overlay(old,new,.7,10)
  new=np.zeros_like(old);new[1,1]=1.5
  with self.assertRaisesRegex(ValueError,"invalid_probabilities"):
   overlay(old,new,.7,10)
if __name__=="__main__":unittest.main()
