"""Injected-HTTP asset contracts; no provider calls or real credentials."""
import copy, json, socket, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'ops/staffportal-release-executor/runtime'))
from cloudflare_adapter import CloudflareAdapter
from publisher import ACCOUNT,WORKER,Publisher,Journal,Stop,Uncertain,digest
from evidence import upload_evidence

VID='11111111-1111-1111-1111-111111111111'
OLD='22222222-2222-2222-2222-222222222222'
DID='33333333-3333-3333-3333-333333333333'
PRIVATE='SYNTHETIC_PRIVATE_TOKEN_NEVER_EXPORT'

def ok(result):return {'success':True,'errors':[],'result':result}
def current():return {'deployments':[{'id':DID,'versions':[{'version_id':OLD,'percentage':100}]}]}
def package():
    files={'/a.txt':b'a','/b.txt':b'b','/c.txt':b'c'}
    return {'archive':'synthetic-only','worker':b'worker','config':{'account_id':ACCOUNT,'name':WORKER},
            'files':files,'manifest':{p:{'hash':digest(b)[:32],'size':len(b)} for p,b in files.items()},
            'asset_sha256':{p:digest(b) for p,b in files.items()}}
def metadata():return {'main_module':'worker.mjs','bindings':[{'name':'synthetic'+str(i),'type':'plain_text','text':'fixture'} for i in range(31)],'assets':{'config':{'run_worker_first':True}}}

class SyntheticBaseline:
    def validate_metadata(self,m):
        if m!=metadata():raise Stop('synthetic metadata differs')
    def assert_publishable(self):pass
    def identity_sha256(self):return digest(b'SYNTHETIC-NOT-PROVIDER-EVIDENCE')

class HTTP:
    def __init__(self,answers):self.answers=iter(answers);self.calls=[]
    def __call__(self,method,url,headers,body):
        self.calls.append((method,url,headers,body));a=next(self.answers)
        if isinstance(a,Exception):raise a
        status,result=a
        return status,{},result if isinstance(result,bytes) else json.dumps(result).encode()

def fixture(bucket_answers,extra=None):
    p=package();hs=[e['hash'] for e in p['manifest'].values()]
    answers=[(200,ok(current())),(200,ok({'jwt':PRIVATE,'buckets':[[h] for h in hs]})),*bucket_answers]
    if extra is not None:answers.extend(extra)
    http=HTTP(answers);a=CloudflareAdapter(PRIVATE,metadata(),http,baseline=SyntheticBaseline())
    expected={'account':ACCOUNT,'worker':WORKER,'bindings':{str(i):{} for i in range(31)},
              'current':{'deployment':DID,'target':WORKER,'versions':[{'version_id':OLD,'percentage':100}]}}
    return p,a,http,expected

class AssetBucket202Tests(unittest.TestCase):
    def setUp(self):
        self.network=patch.object(socket.socket,'connect',side_effect=AssertionError('OFFLINE_ONLY'))
        self.network.start();self.addCleanup(self.network.stop)

    def run_flow(self,answers):
        p,a,http,expected=fixture(answers,[(200,ok({'id':VID})),(200,ok(current()))])
        with tempfile.TemporaryDirectory() as tmp:
            j=Journal(Path(tmp)/'journal.json');proof=Publisher(a,j,expected).upload_only(p)
            saved=j.path.read_text();data=copy.deepcopy(j.data)
        return p,a,http,proof,saved,data

    def test_two_202_buckets_then_201_complete_full_association(self):
        p,a,http,proof,saved,j=self.run_flow([(202,ok({})),(202,ok({})),(201,ok({'jwt':PRIVATE+'FINAL'}))])
        self.assertEqual(proof['versionId'],VID)
        self.assertEqual([r['httpStatus'] for r in proof['completion']['responses']],[200,202,202,201])
        self.assertEqual([r['kind'] for r in j['completed_writes']],['session','bucket','bucket','bucket','version'])
        self.assertIsNone(j['pending']);self.assertTrue(j['version_attempted'])
        self.assertFalse(proof['deploymentObservation']['candidateAllocated'])
        self.assertEqual(sum(m=='POST' and '/versions?' in u for m,u,_,_ in http.calls),1)
        self.assertNotIn(PRIVATE,saved);self.assertNotIn(PRIVATE,json.dumps(proof))

    def test_mixed_200_202_and_optional_result_complete(self):
        _,_,_,proof,_,_=self.run_flow([(200,ok({})),(202,{'success':True,'errors':[]}),(201,ok({'jwt':PRIVATE+'FINAL'}))])
        self.assertEqual([r['httpStatus'] for r in proof['completion']['responses']],[200,200,202,201])

    def test_final_202_never_authorizes_version_even_with_jwt(self):
        for result in ({},{'jwt':PRIVATE+'FALSE'}):
            p,a,http,expected=fixture([(202,ok({})),(202,ok({})),(202,ok(result))])
            with tempfile.TemporaryDirectory() as tmp:
                j=Journal(Path(tmp)/'journal')
                with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
                self.assertEqual(j.data['pending']['kind'],'bucket');self.assertFalse(j.data['version_attempted'])
                self.assertFalse(any('/versions?' in u for _,u,_,_ in http.calls))
                self.assertEqual(len(http.calls),5)

    def test_201_without_valid_completion_and_final_200_still_hold(self):
        for status,result in ((201,{}),(201,{'jwt':None}),(200,{'jwt':PRIVATE+'FALSE'})):
            p,a,http,expected=fixture([(202,ok({})),(202,ok({})),(status,ok(result))])
            with tempfile.TemporaryDirectory() as tmp:
                j=Journal(Path(tmp)/'journal')
                with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
                self.assertFalse(j.data['version_attempted'])

    def test_premature_201_stops_remaining_bucket_requests(self):
        p,a,http,expected=fixture([(201,ok({'jwt':PRIVATE+'EARLY'}))])
        with tempfile.TemporaryDirectory() as tmp:
            j=Journal(Path(tmp)/'journal')
            with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
            self.assertEqual(len(http.calls),3);self.assertFalse(j.data['version_attempted'])

    def test_202_errors_null_malformed_and_false_success_still_hold(self):
        for result in (ok(None),ok([]),{'success':False,'result':{}},
                       {'success':True,'result':{},'errors':[{'code':10001,'message':PRIVATE}]},b'PRIVATE'):
            p,a,http,expected=fixture([(202,result)])
            with tempfile.TemporaryDirectory() as tmp:
                j=Journal(Path(tmp)/'journal')
                with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
                self.assertEqual(j.data['pending']['kind'],'bucket');self.assertFalse(j.data['version_attempted'])
                self.assertEqual(len(http.calls),3);self.assertNotIn(PRIVATE,j.path.read_text())

    def test_other_unexpected_2xx_responses_remain_held(self):
        for status in (203,204,205,206):
            p,a,http,expected=fixture([(status,ok({}))])
            with tempfile.TemporaryDirectory() as tmp:
                j=Journal(Path(tmp)/'journal')
                with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
                self.assertEqual(len(http.calls),3);self.assertFalse(j.data['version_attempted'])

    def test_202_allowance_does_not_apply_to_session_version_or_get(self):
        for method,path in [('POST','/workers/scripts/'+WORKER+'/assets-upload-session'),
                            ('POST','/workers/workers/'+WORKER+'/versions?deploy=false'),
                            ('GET','/workers/scripts/'+WORKER+'/settings')]:
            http=HTTP([(202,ok({'jwt':PRIVATE,'id':VID,'buckets':[]}))])
            a=CloudflareAdapter(PRIVATE,metadata(),http,baseline=SyntheticBaseline())
            with self.assertRaises(Uncertain):a._call(method,path,PRIVATE,statuses=(200,201))
            self.assertEqual(len(http.calls),1)

    def test_evidence_validator_rejects_202_as_final_completion(self):
        p,a,_,_,_,_=self.run_flow([(202,ok({})),(202,ok({})),(201,ok({'jwt':PRIVATE+'FINAL'}))])
        a._evidence['completion']['responses'][-1]['httpStatus']=202
        with self.assertRaisesRegex(Stop,'completion'):upload_evidence(p,a,VID)

    def test_lost_response_after_202_preserves_hold_without_reposting(self):
        p,a,http,expected=fixture([(202,ok({})),TimeoutError(PRIVATE)])
        with tempfile.TemporaryDirectory() as tmp:
            j=Journal(Path(tmp)/'journal')
            with self.assertRaises(Stop):Publisher(a,j,expected).upload_only(p)
            self.assertEqual(j.data['pending']['kind'],'bucket');self.assertFalse(j.data['version_attempted'])
            self.assertEqual([e['kind'] for e in j.data['completed_writes']],['session','bucket'])
            with self.assertRaises(Stop):Publisher(a,Journal(j.path),expected).upload_only(p)
            self.assertEqual(len(http.calls),4)

    def test_latest_42105277007_still_blocks_any_automatic_new_attempt(self):
        import test_bucket_recovery_guard as g
        r=g.Reader();env=g.env();del env[g.e.PROGRESS_RECOVERY_ENV]
        with self.assertRaisesRegex(g.e.Held,'PRIOR_ASSET_PROGRESS_OWNER_ACCEPTANCE_REQUIRED'):g.e.workflow_guard(env,r)
        self.assertEqual(r.calls,[])

if __name__=='__main__':unittest.main(verbosity=2)
