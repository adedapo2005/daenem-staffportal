import sys,copy,datetime as dt,unittest
from pathlib import Path
from unittest.mock import patch
here=Path(__file__).resolve().parent
root=here.parents[1]
runtime=root/'ops/staffportal-release-executor/runtime'
if not runtime.is_dir():runtime=here.parent/'successor-restoration'
sys.path.insert(0,str(runtime));sys.path.insert(0,str(here))
import staffportal_personal_services as m
from workers_api_plan import WorkersAPIPlan
class Tests(unittest.TestCase):
 def plan(self):
  created=m.now();window=m.PreservedValues({'bindings':[{'name':name,'type':'plain_text','text':value} for name,value in [('SP_EFFECT_OPERATOR_SHA256','a'*64),('SP_EFFECT_OPERATOR_EXPIRES_AT','2026-11-06T01:30:00+00:00')]]},{'config':'b'*64},created)
  return m.make_plan(WorkersAPIPlan,window,{'archive':'c'*64,'config':'b'*64,'count':1,'assets':'d'*64})
 def test_serving_baseline_does_not_replace_inheritance_source(self):
  p=self.plan();self.assertEqual(p.expected_current()['versions'],[{'version_id':'eb33552f-1d86-47ee-91c0-abf05c357579','percentage':100}]);self.assertEqual(p.expected_current()['deployment'],'6c682134-c302-47f1-997c-0a186c1c5503');rows=[r for r in p.version_metadata()['bindings'] if r['type']=='inherit'];self.assertEqual(len(rows),28);self.assertTrue(all(r['version_id']=='47927e3c-827a-4b7a-842c-8bdd6e88883e' for r in rows))
 def test_exact_operator_values_are_retained_without_regeneration(self):
  p=self.plan();r={r['name']:r for r in p.version_metadata()['bindings']};self.assertEqual(r['SP_EFFECT_OPERATOR_SHA256']['text'],'a'*64);self.assertEqual(r['SP_EFFECT_OPERATOR_EXPIRES_AT']['text'],'2026-11-06T01:30:00+00:00');self.assertEqual(r['ASSETS'],{'name':'ASSETS','type':'assets'})
 def test_settings_patch_stops_before_any_sender(self):
  with patch.object(m.urllib.request,'Request') as sender,self.assertRaises(m.Held):m.request(m.SCRIPT+'/script-settings','synthetic','PATCH',b'{}')
  sender.assert_not_called()
 def test_unrelated_post_is_forbidden(self):
  with patch.object(m.urllib.request,'Request') as sender,self.assertRaises(m.Held):m.request(m.ROOT+'/settings','synthetic','POST',b'{}')
  sender.assert_not_called()
 def test_exact_verified_off_shapes_are_accepted(self):
  p=self.plan();self.assertIsInstance(p.shared_settings({'observability':copy.deepcopy(m.EXPECTED_SHARED['worker']),'logpush':False,'tail_consumers':[]},{'observability':None,'logpush':False,'tail_consumers':None}),dict)
 def test_changed_off_shape_is_not_adopted_as_new_baseline(self):
  for part in ['head_sampling_rate','issues']:
   worker={'observability':copy.deepcopy(m.EXPECTED_SHARED['worker']),'logpush':False,'tail_consumers':[]};worker['observability'][part]=0.1 if part=='head_sampling_rate' else {'enabled':False}
   with self.assertRaises(Exception):self.plan().shared_settings(worker,{'observability':None,'logpush':False,'tail_consumers':None})
 def test_logging_or_tail_activation_stops(self):
  for part in ['logs','traces']:
   worker={'observability':copy.deepcopy(m.EXPECTED_SHARED['worker']),'logpush':False,'tail_consumers':[]};worker['observability'][part]['enabled']=True
   with self.assertRaises(Exception):self.plan().shared_settings(worker,{'observability':None,'logpush':False,'tail_consumers':None})
 def test_foreign_binding_is_rejected(self):
  p=self.plan();rows=copy.deepcopy(p.projection()['bindings']);rows[0]={'name':'FOREIGN','type':'assets'}
  with self.assertRaises(Exception):p.binding_projection(rows,target=True)
 def test_new_intent_has_unique_identity(self):
  self.assertNotIn(m.INTENT_NAME,['staffportal-corrected-frontend-20261106-intent','staffportal-corrected-frontend-20261106-resume-intent']);self.assertNotIn('RESUME',m.MARKER)
if __name__=='__main__':unittest.main()
