import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from campaigns import discover, ordered_similarity, shift_signal

def row(sequence, created=100):
    return created,json.dumps({'tactics':sorted(set(sequence)),'sequence':sequence,'channels':['message','payment']})

class Campaigns(unittest.TestCase):
    def test_order_changes_cluster_membership(self):
        a=['authority','isolation','remote_access','apk','payment']
        rows=[row(a,100+i) for i in range(3)]+[row(list(reversed(a)),110+i) for i in range(3)]
        groups=discover(rows,{},120)
        self.assertEqual(len(groups),2)
        self.assertNotEqual(groups[0]['signature'],groups[1]['signature'])
        self.assertLess(ordered_similarity(a,list(reversed(a))),.70)

    def test_synthetic_emerging_composition_after_baseline(self):
        novel=['authority','isolation','remote_access','apk','payment']
        rows=[row(['payment'],i) for i in range(20)]+[row(novel,i) for i in range(20,40)]
        groups=discover(rows,{},40)
        self.assertEqual(len(groups),1)
        g=groups[0]
        self.assertEqual(g['reports'],20)
        self.assertEqual(g['composition'],'Unmapped tactic composition')
        self.assertTrue(g['shift']['detected'])
        self.assertEqual(g['shift']['baseline_count'],0)
        self.assertEqual(g['shift']['recent_count'],20)
        self.assertEqual(g['seconds_to_candidate'],2)
        self.assertFalse(g['trusted_reporters_verified'])

    def test_stationary_mix_does_not_create_shift(self):
        self.assertFalse(shift_signal(list(range(0,40,2)),40,1)['detected'])
        self.assertFalse(shift_signal([1,2,3],10,1)['enough_data'])

    def test_three_reports_and_review_are_separate(self):
        a=['authority','threat','payment']
        self.assertEqual(discover([row(a),row(a)],{},100),[])
        first=discover([row(a,100),row(a,101),row(a,102)],{},102)[0]
        reviewed=discover([row(a,100),row(a,101),row(a,102)],{first['signature']:'reviewed'},102)[0]
        self.assertEqual(reviewed['status'],'reviewed')
        self.assertFalse(reviewed['trusted_reporters_verified'])

if __name__=='__main__':unittest.main()
