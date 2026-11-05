"""Exact HTTP-202 historical-run decision; injected GitHub reads only."""
import copy,json,socket,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import test_bucket_recovery_guard as g

e=g.e
PROFILE=json.loads((g.EXEC/'RECOVERY-42105277007.json').read_text())
PREFIX='repos/'+e.REPO+'/actions/runs/42105277007'

def call(r=None,row=None,accept=True):
    return e.review_prior_asset_progress(r or g.Reader(),row or PROFILE['run'],408290809,owner_acceptance=accept)

class ProgressRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.network=patch.object(socket.socket,'connect',side_effect=AssertionError('OFFLINE_ONLY'))
        self.network.start();self.addCleanup(self.network.stop)

    def test_exact_case_retains_202_observation_without_claiming_asset_completion(self):
        r=g.Reader();result=call(r)
        self.assertEqual(len(r.calls),3);self.assertEqual(result['runId'],42105277007)
        self.assertEqual(result['firstBucketResponseHttpStatus'],202)
        self.assertEqual(result['observedStop'],'PINNED_ADAPTER_REJECTED_HTTP_202')
        self.assertEqual(result['priorAssetStaging'],'UNKNOWN')
        self.assertTrue(result['priorJournalRemainsHeld']);self.assertFalse(result['priorVersionAttempted'])
        self.assertFalse(result['automaticRetryAuthorized'])

    def test_missing_or_nonboolean_case_acceptance_fails_before_any_read(self):
        for value in (False,None,1,'true','42105277007',[],{}):
            r=g.Reader()
            with self.subTest(value=value),self.assertRaises(e.Held):call(r,accept=value)
            self.assertEqual(r.calls,[])

    def test_wrong_source_attempt_run_workflow_or_event_is_not_accepted(self):
        for k,v in [('id',42105277008),('run_attempt',2),('run_attempt',True),('workflow_id',1),
                    ('head_sha','0'*40),('head_branch','other'),('event','push'),('conclusion','success'),('path','other')]:
            row=copy.deepcopy(PROFILE['run']);row[k]=v;r=g.Reader()
            with self.subTest(key=k,value=v),self.assertRaises(e.Held):call(r,row)
            self.assertEqual(r.calls,[])

    def test_changed_independent_run_and_job_reads_remain_held(self):
        for mode in ('source','attempt','job','job-count','job-count-bool','job-status'):
            r=g.Reader()
            if mode=='source':r.data[PREFIX]['head_sha']='0'*40
            elif mode=='attempt':r.data[PREFIX]['run_attempt']=2
            elif mode=='job':r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['id']=1
            elif mode=='job-count':r.data[PREFIX+'/jobs?per_page=100']['total_count']=2
            elif mode=='job-count-bool':r.data[PREFIX+'/jobs?per_page=100']['total_count']=True
            else:r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['status']='in_progress'
            with self.subTest(mode=mode),self.assertRaises(e.Held):call(r)

    def test_each_changed_step_or_incomplete_step_is_rejected(self):
        for i in range(len(PROFILE['steps'])):
            r=g.Reader();step=r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['steps'][i]
            step['conclusion']='success' if step['conclusion']!='success' else 'skipped'
            with self.subTest(step=i),self.assertRaises(e.Held):call(r)
        for mode in ('missing','extra','order','unfinished'):
            r=g.Reader();steps=r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['steps']
            if mode=='missing':steps.pop()
            elif mode=='extra':steps.append(copy.deepcopy(steps[-1]))
            elif mode=='order':steps.reverse()
            else:steps[0]['status']='in_progress'
            with self.subTest(mode=mode),self.assertRaises(e.Held):call(r)

    def test_artifact_bytes_identity_and_workflow_identity_are_enforced(self):
        for i in (0,1):
            for key,value in [('id',1),('expired',True),('digest','sha256:'+'0'*64),('size_in_bytes',1),('name','other')]:
                r=g.Reader();r.data[PREFIX+'/artifacts?per_page=100']['artifacts'][i][key]=value
                with self.subTest(index=i,key=key),self.assertRaises(e.Held):call(r)
            for key,value in [('id',1),('repository_id',1),('head_repository_id',1),('head_sha','0'*40),('head_branch','other')]:
                r=g.Reader();r.data[PREFIX+'/artifacts?per_page=100']['artifacts'][i]['workflow_run'][key]=value
                with self.subTest(index=i,identity=key),self.assertRaises(e.Held):call(r)

    def test_missing_extra_duplicate_or_expired_artifact_set_remains_held(self):
        for mode in ('missing','extra','duplicate','wrong-count','bool-count'):
            r=g.Reader();data=r.data[PREFIX+'/artifacts?per_page=100']
            if mode=='missing':data['artifacts'].pop()
            elif mode=='extra':data['artifacts'].append(copy.deepcopy(data['artifacts'][0]))
            elif mode=='duplicate':data['artifacts'][1]=copy.deepcopy(data['artifacts'][0])
            elif mode=='wrong-count':data['total_count']=1
            else:data['total_count']=True
            with self.subTest(mode=mode),self.assertRaises(e.Held):call(r)

    def test_changed_profile_pin_and_arbitrary_profile_key_fail_before_reads(self):
        r=g.Reader()
        with patch.object(e,'PROGRESS_RECOVERY_PROFILE_SHA','0'*64),self.assertRaises(e.Held):call(r)
        self.assertEqual(r.calls,[])
        for key in ('other','../RECOVERY',None,{},[]):
            r=g.Reader()
            with self.subTest(key=key),self.assertRaises(e.Held):e._verify_captured_bucket_history(r,PROFILE['run'],408290809,key)
            self.assertEqual(r.calls,[])

    def test_history_guard_requires_latest_marker_before_reads_and_exact_seven_runs(self):
        for value in (None,'','true',True,42105277007,'other'):
            env=g.env();env[e.PROGRESS_RECOVERY_ENV]=value;r=g.Reader()
            with self.subTest(value=value),self.assertRaises(e.Held):e.workflow_guard(env,r)
            self.assertEqual(r.calls,[])
        proof=e.workflow_guard(g.env(),g.Reader())
        self.assertEqual(proof['ownerAcceptedUnfinishedAssetProgressRun'],42105277007)
        self.assertEqual(len(proof['reconciledPreuploadRuns']),7)

    def test_older_acknowledgements_alone_do_not_allow_upload_boundary(self):
        good={'ownerAcceptedUnknownAssetStagingRun':42078524520,'ownerAcceptedUnknownBucketOutcomeRun':42090422145,
              'ownerAcceptedUnfinishedAssetProgressRun':42105277007}
        e.require_fresh_session_review(g.env(),good)
        for value in (None,False,True,'42105277007',1):
            guard={**good,'ownerAcceptedUnfinishedAssetProgressRun':value}
            with self.subTest(value=value),self.assertRaises(e.Held):e.require_fresh_session_review(g.env(),guard)

    def test_upload_entry_missing_latest_acceptance_stops_before_window_and_adapter(self):
        class Deps:
            def package(self,p):return {}
            def operator(self,p):pass
            def window(self,*a):raise AssertionError('WINDOW_MUST_NOT_BE_REACHED')
        env=g.env();del env[e.PROGRESS_RECOVERY_ENV]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'public';state.mkdir();context=e.github_context(env)
            guard={**context,'guard':'FIRST_PUBLISHING_RUN_ONLY','ownerAcceptedUnknownAssetStagingRun':42078524520,
                   'ownerAcceptedUnknownBucketOutcomeRun':42090422145,'ownerAcceptedUnfinishedAssetProgressRun':42105277007}
            (state/'github-guard.json').write_text(json.dumps(guard))
            args=SimpleNamespace(command='upload',state_dir=state,window_dir=root/'private',operator_package=root/'operator',application_zip=root/'app',execute_approved_upload=True)
            with self.assertRaisesRegex(e.Held,'PRIOR_ASSET_PROGRESS_OWNER_ACCEPTANCE_REQUIRED'):e.execute(args,env=env,deps=Deps())
            self.assertFalse((state/'journal.json').exists())

    def test_missing_known_run_foreign_eighth_run_or_future_rerun_never_passes(self):
        for mode in ('missing','extra','duplicate','rerun'):
            r=g.Reader();data=r.data[g.LIST]
            if mode=='missing':data['workflow_runs']=[x for x in data['workflow_runs'] if x['id']!=42105277007];data['total_count']-=1
            elif mode=='extra':data['workflow_runs'].append({**PROFILE['run'],'id':42105277008});data['total_count']+=1
            elif mode=='duplicate':data['workflow_runs'].append(copy.deepcopy(data['workflow_runs'][-1]));data['total_count']+=1
            else:data['workflow_runs'][0]['run_attempt']=2
            with self.subTest(mode=mode),self.assertRaises(e.Held):e.workflow_guard(g.env(),r)

if __name__=='__main__':unittest.main(verbosity=2)
