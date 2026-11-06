import copy,datetime as dt,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import staffportal_frontend_successor as m

def shared(enabled=True):
    return {'enabled':False,'head_sampling_rate':0.25,'logs':{'enabled':False,'invocation_logs':False,'persist':False},'traces':{'enabled':False,'head_sampling_rate':0},'issues':{'enabled':enabled}}
class Plan:
    class Window:
        def value_pins(self):return {}
    window=Window()
    def projection(self):return {'access':{'enabled':True,'previews_enabled':True}}
    def binding_projection(self,rows,**kw):
        m.require(rows==[{'name':'resource','type':'fixture'}],'BINDINGS_HELD');return rows
    def version_settings(self,obj,**kw):
        m.require(obj.get('runtime')=='pinned','RUNTIME_HELD');return 'pinned'
    def shared_settings(self,w,s):
        m.require(not w['observability']['issues']['enabled'] and not s['observability']['issues']['enabled'],'SHARED_HELD')
class Tests(unittest.TestCase):
    def fixture(self):
        return {m.ROOT:{'name':m.WORKER,'id':'fixture-worker','subdomain':{'enabled':True,'previews_enabled':True},'observability':shared(),'logpush':False,'tail_consumers':[]},m.ROOT+'/versions/'+m.PRIOR:{'id':m.PRIOR,'bindings':[{'name':'resource','type':'fixture'}],'runtime':'pinned'},m.SCRIPT+'/settings':{'bindings':[{'name':'resource','type':'fixture'}],'runtime':'pinned','placement':{}},m.SCRIPT+'/script-settings':{'observability':shared(),'logpush':False,'tail_consumers':None},m.SCRIPT+'/deployments':{'deployments':[{'id':m.DEPLOYMENT,'versions':[{'version_id':m.PRIOR,'percentage':100}]}]}}
    def test_only_pinned_retained_window_may_differ_from_serving_bindings(self):
        class P:
            class Window:
                def value_pins(self):return {'SP_EFFECT_OPERATOR_SHA256':'retained-pin'}
            window=Window()
            def binding_projection(self,raw,**kw):return copy.deepcopy(raw)
        old=[{'name':'resource','id':'same'},{'name':'SP_EFFECT_OPERATOR_SHA256','valueSha256':'prior-pin'}]
        retained=[{'name':'resource','id':'same'},{'name':'SP_EFFECT_OPERATOR_SHA256','valueSha256':'retained-pin'}]
        self.assertEqual(m.checked_current_bindings(P(),old,retained),retained)
        unknown=copy.deepcopy(retained);unknown[1]['valueSha256']='unapproved'
        with self.assertRaises(m.Held):m.checked_current_bindings(P(),old,unknown)
        foreign=copy.deepcopy(retained);foreign[0]['id']='foreign'
        with self.assertRaises(m.Held):m.checked_current_bindings(P(),old,foreign)
    def test_settings_request_changes_only_issues(self):
        data=self.fixture();old=copy.deepcopy(data)
        desired,body=m.desired_settings(data[m.ROOT],data[m.SCRIPT+'/script-settings'])
        want=shared(False)
        self.assertEqual(body,{'observability':want});self.assertEqual(data,old)
        self.assertEqual(desired,{'worker':want,'script':want})
    def test_unknown_config_and_enabled_logs_stop(self):
        for field in ('unknown','logs'):
            data=self.fixture()
            if field=='unknown':data[m.ROOT]['observability']['unknown']=False
            else:data[m.ROOT]['observability']['logs']['enabled']=True
            with self.assertRaises(m.Held):m.desired_settings(data[m.ROOT],data[m.SCRIPT+'/script-settings'])
    def test_each_failed_read_stops_later_reads(self):
        paths=list(self.fixture())
        for at in range(len(paths)):
            calls=[];data=self.fixture()
            def read(path,*args,**kw):
                calls.append(path)
                if len(calls)==at+1:raise m.Held('READ_FAILED')
                return data[path]
            with patch.object(m,'request',read),self.assertRaises(m.Held):m.inspect('synthetic',Plan(),True)
            self.assertEqual(len(calls),at+1)
    def test_baseline_and_binding_drift_stop_before_settings_or_deploy(self):
        for path,field,value,maxcalls in [(m.ROOT,'name','wrong-worker',1),(m.ROOT+'/versions/'+m.PRIOR,'id','wrong',2),(m.SCRIPT+'/settings','bindings',[],3)]:
            data=self.fixture();data[path][field]=value;calls=[]
            def read(path,*a,**kw):calls.append(path);return data[path]
            with patch.object(m,'request',read),self.assertRaises(m.Held):m.inspect('synthetic',Plan(),True)
            self.assertEqual(len(calls),maxcalls)
    def test_changed_deployment_is_not_rebased(self):
        data=self.fixture();data[m.SCRIPT+'/deployments']['deployments'][0]['id']='foreign'
        with patch.object(m,'request',lambda p,*a,**kw:data[p]),self.assertRaises(m.Held):m.inspect('synthetic',Plan(),True)
    def test_descriptive_url_metadata_does_not_change_access_flags(self):
        data=self.fixture();data[m.ROOT]['subdomain']['hostname']='existing.example.test'
        with patch.object(m,'request',lambda p,*a,**kw:data[p]):m.inspect('synthetic',Plan(),True)
        data[m.ROOT]['subdomain']['previews_enabled']=False
        with patch.object(m,'request',lambda p,*a,**kw:data[p]),self.assertRaises(m.Held):m.inspect('synthetic',Plan(),True)
    def test_fingerprint_covers_binding_runtime_and_unrelated_observability(self):
        data=self.fixture()
        with patch.object(m,'request',lambda p,*a,**kw:data[p]):first=m.inspect('synthetic',Plan(),True)
        for path in (m.ROOT,m.SCRIPT+'/script-settings'):data[path]['observability']['head_sampling_rate']=0.5
        with patch.object(m,'request',lambda p,*a,**kw:data[p]):second=m.inspect('synthetic',Plan(),True)
        self.assertNotEqual(first['fingerprint'],second['fingerprint'])
    def test_routing_only_documented_defaults(self):
        want={'run_worker_first':True,'not_found_handling':'single-page-application'}
        self.assertTrue(m.routing_ok({**want,'html_handling':'auto-trailing-slash','base_path':'/'},want))
        self.assertFalse(m.routing_ok({**want,'base_path':'/foreign/'},want))
        self.assertFalse(m.routing_ok({**want,'unreviewed':False},want))
        self.assertFalse(m.routing_ok({'run_worker_first':1,'not_found_handling':'single-page-application'},want))
    def test_activation_uses_post_id_and_independent_get_not_echo_fields(self):
        calls=[];identifier='11111111-1111-4111-8111-111111111111';version='22222222-2222-4222-8222-222222222222'
        def request(path,token,method='GET',body=None):
            calls.append(method)
            if method=='POST':return {'id':identifier}
            return {'deployments':[{'id':identifier,'versions':[{'version_id':version,'percentage':100}]}]}
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'OUT',Path(tmp)),patch.object(m,'inspect'),patch.object(m,'verify_candidate'),patch.object(m,'request',request):
            result=m.activate('synthetic',None,version)
        self.assertEqual(calls,['POST','GET']);self.assertEqual(result['percentage'],100)
    def test_uncertain_post_never_repeated_and_retains_intent(self):
        calls=[]
        def request(*args,**kw):calls.append(args);raise TimeoutError()
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'OUT',Path(tmp)),patch.object(m,'inspect'),patch.object(m,'verify_candidate'),patch.object(m,'request',request):
            with self.assertRaises(m.Held):m.activate('synthetic',None,'22222222-2222-4222-8222-222222222222')
            self.assertTrue((Path(tmp)/'activation-post-intent.json').exists());self.assertEqual(json.loads((Path(tmp)/'activation-receipt.json').read_text())['state'],'ACTIVATION_OUTCOME_UNKNOWN')
        self.assertEqual(len(calls),1)
    def test_failed_post_read_leaves_unknown_and_no_second_post(self):
        calls=[]
        def request(path,token,method='GET',body=None):
            calls.append(method)
            if method=='POST':return {'id':'11111111-1111-4111-8111-111111111111'}
            raise m.Held('READ_FAILED')
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'OUT',Path(tmp)),patch.object(m,'inspect'),patch.object(m,'verify_candidate'),patch.object(m,'request',request),self.assertRaises(m.Held):m.activate('synthetic',None,'22222222-2222-4222-8222-222222222222')
        self.assertEqual(calls,['POST','GET'])
if __name__=='__main__':unittest.main()
