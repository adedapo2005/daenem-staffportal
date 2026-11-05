import copy, hashlib, importlib.util, json, socket, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
EXEC=ROOT/'ops/staffportal-release-executor'
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('guard_candidate',EXEC/'release_executor.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
PROFILE=json.loads((EXEC/'RECOVERY-42090422145.json').read_text())
FIXTURE=json.loads((Path(__file__).with_name('history-fixture.json')).read_text())
PREFIX='repos/'+e.REPO+'/actions/runs/42090422145'
WF='repos/'+e.REPO+'/actions/workflows/'+e.WORKFLOW
LIST='repos/'+e.REPO+'/actions/workflows/408290809/runs?per_page=100&page=1'
RID=99999999999

def env():
    return {'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':e.REPO,'GITHUB_ACTOR':'adedapo2005',
            'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_RUN_ATTEMPT':'1',
            'GITHUB_WORKFLOW_REF':e.WORKFLOW_REF,'GITHUB_WORKFLOW_SHA':'d'*40,'GITHUB_SHA':'d'*40,
            'GITHUB_RUN_ID':str(RID),'SP_FRESH_SESSION_REVIEW':'42078524520',e.BUCKET_RECOVERY_ENV:'42090422145',e.PROGRESS_RECOVERY_ENV:'42105277007'}

class Reader:
    def __init__(self):
        self.data=copy.deepcopy(FIXTURE);self.calls=[]
        rows=[v for k,v in self.data.items() if '/actions/runs/' in k and k.count('/')==5]
        current={**PROFILE['run'],'id':RID,'head_sha':'d'*40,'status':'in_progress','conclusion':None}
        self.data[LIST]={'total_count':8,'workflow_runs':[current]+rows}
    def json(self,path):self.calls.append(path);return copy.deepcopy(self.data[path])

def call(reader=None,row=None,accept=True):
    return e.review_prior_bucket_outcome(reader or Reader(),row or PROFILE['run'],408290809,owner_acceptance=accept)

class RecoveryGuardTests(unittest.TestCase):
    def setUp(self):
        self.no_network=patch.object(socket.socket,'connect',side_effect=AssertionError('OFFLINE_ONLY'))
        self.no_network.start();self.addCleanup(self.no_network.stop)

    def test_exact_profile_matches_current_retained_metadata_and_keeps_unknown_hold(self):
        r=Reader();result=call(r)
        self.assertEqual(len(r.calls),3);self.assertEqual(result['runId'],42090422145)
        self.assertEqual(result['priorAssetStaging'],'UNKNOWN');self.assertEqual(result['pendingBucketPostSent'],'UNKNOWN')
        self.assertEqual(result['actualFailureCause'],'UNCONFIRMED');self.assertTrue(result['priorJournalRemainsHeld'])
        self.assertFalse(result['priorVersionAttempted']);self.assertFalse(result['automaticRetryAuthorized'])

    def test_default_and_nonboolean_acceptance_fail_before_reads(self):
        for v in (False,None,'true','42090422145',1,[],{}):
            r=Reader()
            with self.subTest(value=v),self.assertRaises(e.Held):call(r,accept=v)
            self.assertEqual(r.calls,[])

    def test_wrong_source_attempt_workflow_run_event_or_outcome_rejected(self):
        for k,v in [('head_sha','0'*40),('run_attempt',2),('run_attempt',True),('id',42090422146),
                    ('workflow_id',1),('head_branch','other'),('event','push'),('status','in_progress'),('conclusion','success'),('path','other')]:
            r=Reader();row=copy.deepcopy(PROFILE['run']);row[k]=v
            with self.subTest(key=k,value=v),self.assertRaises(e.Held):call(r,row)
            self.assertEqual(r.calls,[])

    def test_changed_independent_run_read_rejected(self):
        for k,v in [('head_sha','0'*40),('run_attempt',2),('conclusion','cancelled')]:
            r=Reader();r.data[PREFIX][k]=v
            with self.subTest(key=k),self.assertRaises(e.Held):call(r)

    def test_wrong_job_identity_status_or_conclusion_rejected(self):
        for k,v in [('id',1),('run_id',1),('name','other'),('status','queued'),('conclusion','success')]:
            r=Reader();r.data[PREFIX+'/jobs?per_page=100']['jobs'][0][k]=v
            with self.subTest(key=k),self.assertRaises(e.Held):call(r)

    def test_missing_extra_or_malformed_job_count_rejected(self):
        for v in (0,2,True,'1'):
            r=Reader();r.data[PREFIX+'/jobs?per_page=100']['total_count']=v
            with self.subTest(count=v),self.assertRaises(e.Held):call(r)
        r=Reader();r.data[PREFIX+'/jobs?per_page=100']['jobs'].append(copy.deepcopy(r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]))
        with self.assertRaises(e.Held):call(r)

    def test_every_changed_step_outcome_is_rejected(self):
        for i in range(len(PROFILE['steps'])):
            r=Reader();r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['steps'][i]['conclusion']='cancelled'
            with self.subTest(step=i),self.assertRaises(e.Held):call(r)

    def test_missing_extra_reordered_or_incomplete_steps_rejected(self):
        for mode in ('missing','extra','order','status','name'):
            r=Reader();steps=r.data[PREFIX+'/jobs?per_page=100']['jobs'][0]['steps']
            if mode=='missing':steps.pop()
            elif mode=='extra':steps.append(copy.deepcopy(steps[0]))
            elif mode=='order':steps.reverse()
            elif mode=='status':steps[0]['status']='in_progress'
            else:steps[0]['name']='other'
            with self.subTest(mode=mode),self.assertRaises(e.Held):call(r)

    def test_both_artifact_pins_and_all_identity_fields_are_enforced(self):
        for i in (0,1):
            for k,v in [('id',1),('name','other'),('size_in_bytes',1),('digest','sha256:'+'0'*64),('expired',True),('expired',0)]:
                r=Reader();r.data[PREFIX+'/artifacts?per_page=100']['artifacts'][i][k]=v
                with self.subTest(artifact=i,key=k,value=v),self.assertRaises(e.Held):call(r)
            for k,v in [('id',1),('head_sha','0'*40),('head_branch','other'),('repository_id',1),('head_repository_id',1)]:
                r=Reader();r.data[PREFIX+'/artifacts?per_page=100']['artifacts'][i]['workflow_run'][k]=v
                with self.subTest(artifact=i,identity=k),self.assertRaises(e.Held):call(r)

    def test_missing_expired_duplicate_or_extra_artifacts_rejected(self):
        for mode in ('count','missing','duplicate','extra','null'):
            r=Reader();a=r.data[PREFIX+'/artifacts?per_page=100']
            if mode=='count':a['total_count']=3
            elif mode=='missing':a['artifacts'].pop()
            elif mode=='duplicate':a['artifacts'][1]=copy.deepcopy(a['artifacts'][0])
            elif mode=='extra':a['artifacts'].append(copy.deepcopy(a['artifacts'][0]))
            else:a['artifacts']=None
            with self.subTest(mode=mode),self.assertRaises(e.Held):call(r)

    def test_profile_tampering_stops_before_reads(self):
        r=Reader()
        with patch.object(e,'BUCKET_RECOVERY_PROFILE_SHA','0'*64),self.assertRaises(e.Held):call(r)
        self.assertEqual(r.calls,[])

    def test_history_guard_accepts_exact_seven_retained_runs_and_one_new_run(self):
        r=Reader();result=e.workflow_guard(env(),r)
        self.assertEqual(result['ownerAcceptedUnknownBucketOutcomeRun'],42090422145)
        self.assertEqual(result['ownerAcceptedUnknownAssetStagingRun'],42078524520)
        self.assertEqual(len(result['reconciledPreuploadRuns']),7)

    def test_history_guard_requires_new_acknowledgement_before_reads(self):
        for v in (None,'','false','true',True,42090422145,'other'):
            en=env();en[e.BUCKET_RECOVERY_ENV]=v;r=Reader()
            with self.subTest(value=v),self.assertRaises(e.Held):e.workflow_guard(en,r)
            self.assertEqual(r.calls,[])

    def test_earlier_acknowledgement_is_still_required(self):
        en=env();del en['SP_FRESH_SESSION_REVIEW']
        with self.assertRaises(e.Held):e.workflow_guard(en,Reader())

    def test_other_historical_run_or_future_rerun_stays_held(self):
        for mode in ('other','missing','duplicate','rerun'):
            r=Reader();data=r.data[LIST]
            if mode=='other':data['workflow_runs'].append({**PROFILE['run'],'id':42090422146});data['total_count']+=1
            elif mode=='missing':data['workflow_runs'].pop();data['total_count']-=1
            elif mode=='duplicate':data['workflow_runs'].append(copy.deepcopy(data['workflow_runs'][1]));data['total_count']+=1
            else:data['workflow_runs'][0]['run_attempt']=2
            with self.subTest(mode=mode),self.assertRaises(e.Held):e.workflow_guard(env(),r)

    def test_current_source_or_context_change_is_held(self):
        for k,v in [('head_sha','0'*40),('workflow_id',1),('event','push')]:
            r=Reader();r.data[LIST]['workflow_runs'][0][k]=v
            with self.subTest(key=k),self.assertRaises(e.Held):e.workflow_guard(env(),r)
        en=env();en['GITHUB_RUN_ATTEMPT']='2'
        with self.assertRaises(e.Held):e.workflow_guard(en,Reader())

    def test_each_upload_boundary_acknowledgement_and_receipt_is_required(self):
        good={'ownerAcceptedUnknownAssetStagingRun':42078524520,'ownerAcceptedUnknownBucketOutcomeRun':42090422145,'ownerAcceptedUnfinishedAssetProgressRun':42105277007}
        e.require_fresh_session_review(env(),good)
        for k in good:
            for v in (None,False,True,str(good[k]),1):
                g={**good,k:v}
                with self.subTest(key=k,value=v),self.assertRaises(e.Held):e.require_fresh_session_review(env(),g)

    def test_actual_upload_entry_rejects_missing_new_ack_before_window_or_adapter(self):
        class Deps:
            def package(self,p):return {}
            def operator(self,p):pass
            def window(self,*a):raise AssertionError('window must not be reached')
        en=env();del en[e.BUCKET_RECOVERY_ENV]
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);state=root/'public';state.mkdir()
            context=e.github_context(en)
            (state/'github-guard.json').write_text(json.dumps({**context,'guard':'FIRST_PUBLISHING_RUN_ONLY',
              'ownerAcceptedUnknownAssetStagingRun':42078524520,'ownerAcceptedUnknownBucketOutcomeRun':42090422145}))
            args=SimpleNamespace(command='upload',state_dir=state,window_dir=root/'private',operator_package=root/'operator',application_zip=root/'app',execute_approved_upload=True)
            with self.assertRaisesRegex(e.Held,'PRIOR_BUCKET_OUTCOME_OWNER_ACCEPTANCE_REQUIRED'):e.execute(args,env=en,deps=Deps())
            self.assertFalse((state/'journal.json').exists())

    def test_workflow_all_three_booleans_default_false_and_job_condition_requires_all(self):
        import yaml
        w=yaml.load((ROOT/'.github/workflows/staffportal-approved-artifact-upload.yml').read_text(),Loader=yaml.BaseLoader)
        inputs=w['on']['workflow_dispatch']['inputs']
        for name in ('accept_prior_asset_staging_unknown','accept_asset_bucket_outcome_unknown_42090422145','accept_asset_progress_outcome_unknown_42105277007'):
            self.assertEqual(inputs[name]['default'],'false');self.assertEqual(inputs[name]['type'],'boolean')
            self.assertEqual(inputs[name]['required'],'true');self.assertIn('inputs.'+name+' == true',w['jobs']['upload']['if'])
        self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertIn('42090422145',w['jobs']['upload']['env'][e.BUCKET_RECOVERY_ENV])

    def test_all_changed_executor_profile_and_workflow_pins_match(self):
        manifest=EXEC/'EXECUTOR-MANIFEST.json';data=json.loads(manifest.read_text())
        for name,pin in data['files'].items():self.assertEqual(hashlib.sha256((EXEC/name).read_bytes()).hexdigest(),pin,name)
        self.assertEqual(hashlib.sha256((EXEC/'RECOVERY-42090422145.json').read_bytes()).hexdigest(),e.BUCKET_RECOVERY_PROFILE_SHA)
        self.assertIn(hashlib.sha256(manifest.read_bytes()).hexdigest(),(ROOT/'.github/workflows/staffportal-approved-artifact-upload.yml').read_text())

if __name__=='__main__':unittest.main(verbosity=2)
