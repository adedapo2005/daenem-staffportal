import copy,unittest
from unittest.mock import patch
import staffportal_resume_frontend as r

class Tests(unittest.TestCase):
    def receipt(self):
        obs={'enabled':False,'head_sampling_rate':1,'redact_query_string':False,'logs':{'enabled':False,'head_sampling_rate':1,'invocation_logs':True,'persist':True},'traces':{'enabled':False,'head_sampling_rate':1,'persist':True}}
        desired={**copy.deepcopy(obs),'issues':{'enabled':False}}
        pins={'archive':'synthetic-archive'}
        original={'held.json':{'reasonCode':'ISSUES_SHAPE_HELD'},'intent.json':{'context':{'runId':r.ORIGINAL['runId']},'archiveSha256':pins['archive']},'preflight.json':{'desiredSettings':{'worker':desired,'script':desired}},'settings-post-intent.json':{'body':{'observability':desired}}}
        report={'state':'THREE_FIXED_GETS_COMPLETED','writesPermitted':False,'requests':[{'method':'GET','path':p,'status':200} for p in [r.m.ROOT,r.m.SCRIPT+'/script-settings',r.m.SCRIPT+'/deployments']],'latestDeployment':{'id':r.m.DEPLOYMENT,'versions':[{'version_id':r.m.PRIOR,'percentage':100}]},'shared':{'worker':{'observability':obs,'logpush':False,'tail_consumers':[]},'script':{'observability':None,'logpush':False,'tail_consumers':None}}}
        return original,{'staffportal-corrected-settings-read.json':report},pins
    def test_verified_remaining_upload_has_no_settings_write(self):
        args=self.receipt();value=r.validate_receipts(*args)
        self.assertIsNone(value['script']);self.assertNotIn('issues',value['worker'])
    def test_any_prior_uploader_receipt_blocks_new_attempt(self):
        args=self.receipt();args[0]['upload-journal.json']={}
        with self.assertRaises(r.m.Held):r.validate_receipts(*args)
    def test_foreign_allocation_cannot_be_adopted(self):
        args=self.receipt();args[1]['staffportal-corrected-settings-read.json']['latestDeployment']['id']='unknown'
        with self.assertRaises(r.m.Held):r.validate_receipts(*args)
    def test_unrelated_setting_change_or_issues_true_stops(self):
        for field in ['head_sampling_rate','issues']:
            args=self.receipt();obs=args[1]['staffportal-corrected-settings-read.json']['shared']['worker']['observability']
            if field=='issues':obs[field]={'enabled':True}
            else:obs[field]=0.1
            with self.assertRaises(r.m.Held):r.validate_receipts(*args)
    def test_settings_patch_is_forbidden_before_sender(self):
        with patch.object(r,'_request') as sender,self.assertRaises(r.m.Held):r.request_without_settings_write(r.m.SCRIPT+'/script-settings','synthetic','PATCH',b'{}')
        sender.assert_not_called()
if __name__=='__main__':unittest.main()
