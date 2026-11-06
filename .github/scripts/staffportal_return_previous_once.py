"""Owner-approved return to the prior version after failed acceptance; never uploads code/assets."""
import datetime as dt,hashlib,importlib.util,json,os,re,sys,urllib.error,urllib.request
from pathlib import Path

REPO='adedapo2005/daenem-staffportal'
BRANCH='ops/staffportal-upload-preflight-read-20261105'
MARKER='STAFFPORTAL RETURN TO 47927e3c-827a-4b7a-842c-8bdd6e88883e AFTER FAILED ACCEPTANCE; OWNER APPROVED'
ARTIFACT='staffportal-return-intent-c7efd7d7-47927e3c'
DIAG_SHA='90980a8f02ec78c787cc7ddce9a5d10a2c2f2a5727fd4769a1427c8e5f83da39'
EXPECTED_SOURCE='c7efd7d7-ac83-4a09-9d5d-8721fbc308c5'
ACTIVATION_PATH='/workers/scripts/daenem-staffportal-api-staging/deployments'
OUTPUT=Path('staffportal-activation-evidence');OUTPUT.mkdir(exist_ok=True)

class Held(Exception):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':')).encode()
def save(name,value,exclusive=False):
    with (OUTPUT/name).open('x' if exclusive else 'w',encoding='utf-8') as f:
        json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def transport(url,token,method='GET',body=None):
    request=urllib.request.Request(url,data=body,method=method,headers={
        'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json',
        'User-Agent':'StaffPortal-exact-existing-version-activation'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
    try:response=opener.open(request,timeout=30)
    except urllib.error.HTTPError as error:response=error
    with response:return response.status,response.read(16*1024*1024+1)
def github(path,token):
    status,raw=transport('https://api.github.com/repos/'+REPO+path,token)
    if status!=200 or len(raw)>16*1024*1024:raise Held('GITHUB_READ_HELD')
    return json.loads(raw)
def context():
    want={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':REPO,'GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'pull_request_review','GITHUB_RUN_ATTEMPT':'1'}
    if any(os.environ.get(k)!=v for k,v in want.items()):raise Held('CONTEXT_HELD')
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text());head=event.get('pull_request',{}).get('head',{})
    if head.get('ref')!=BRANCH or event.get('review',{}).get('body')!=MARKER:raise Held('EXACT_APPROVAL_EVENT_HELD')
    run=os.environ.get('GITHUB_RUN_ID','')
    if not run.isdigit():raise Held('RUN_ID_HELD')
    return {'runId':int(run),'headSha':head['sha'],'reviewId':event['review']['id']}
def load_reader():
    script=Path(__file__).with_name('staffportal_upload_preflight_read.py')
    if sha(script.read_bytes())!=DIAG_SHA:raise Held('READ_SOURCE_HELD')
    spec=importlib.util.spec_from_file_location('fixed_reader',script);reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
    root=Path(__file__).resolve().parents[2]/'ops/staffportal-release-executor';pins=root/'RUNTIME-PINS.json'
    if sha(pins.read_bytes())!=reader.PINS_SHA:raise Held('RUNTIME_PINS_HELD')
    for name,pin in json.loads(pins.read_text())['files'].items():
        if Path(name).name!=name or sha((root/'runtime'/name).read_bytes())!=pin:raise Held('RUNTIME_SOURCE_HELD')
    sys.dont_write_bytecode=True;sys.path.insert(0,str(root/'runtime'))
    from workers_api_plan import WorkersAPIPlan
    return reader,WorkersAPIPlan
def no_competing_writers(gh_token,run_id):
    for state in ('in_progress','queued','waiting','pending','requested'):
        data=github('/actions/runs?status='+state+'&per_page=100',gh_token)
        if data.get('total_count',101)>100 or not isinstance(data.get('workflow_runs'),list):raise Held('WRITER_INVENTORY_INCOMPLETE')
        for run in data['workflow_runs']:
            if run.get('id')==run_id:continue
            if run.get('path') in ('.github/workflows/deploy-staffportal-staging.yml','.github/workflows/staffportal-approved-artifact-upload.yml'):
                raise Held('COMPETING_DEPLOYMENT_HELD')
def fresh_preflight(reader,plan,token,gh_token,ctx):
    no_competing_writers(gh_token,ctx['runId'])
    result=reader.diagnose(token,plan)
    if result.get('state')!='ACTIVATED_ALLOCATION_READ_VERIFIED':
        save('preflight-held.json',result);raise Held('LIVE_CANDIDATE_OR_ALLOCATION_HELD')
    return result
def parse_envelope(status,raw):
    if status!=200 or len(raw)>16*1024*1024:raise Held('PROVIDER_RESPONSE_HELD')
    value=json.loads(raw)
    if not isinstance(value,dict) or value.get('success') is not True or value.get('errors') not in (None,[]) or not isinstance(value.get('result'),dict):raise Held('PROVIDER_RESPONSE_HELD')
    return value['result']
def perform_activation(reader,token,intent,request=transport):
    """Exactly one POST. A failed response never causes a second POST."""
    body={'strategy':'percentage','versions':[{'version_id':reader.SOURCE,'percentage':100}]}
    receipt={'context':intent['context'],'versionId':reader.SOURCE,'state':'ACTIVATION_OUTCOME_UNKNOWN',
        'postAttempted':True,'automaticRetryAuthorized':False,'databaseOperations':False}
    save('post-intent.json',receipt,exclusive=True)
    try:
        status,raw=request(reader.API+ACTIVATION_PATH,token,'POST',canonical(body))
        receipt['httpStatus']=status
        result=parse_envelope(status,raw)
        identifier=result.get('id')
        if not isinstance(identifier,str) or not re.fullmatch('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',identifier):raise Held('DEPLOYMENT_ID_HELD')
        receipt['deploymentId']=identifier
        receipt['responseAllocationEchoMatches']=result.get('versions')==body['versions']
        receipt['responseStrategyEchoMatches']=result.get('strategy')=='percentage'
        # Success requires the independent serving-allocation read below; the
        # legacy deployment response need not echo the complete GET schema.
        receipt['state']='ACTIVATION_RESPONSE_CONFIRMED';save('receipt.json',receipt)
        status,raw=request(reader.API+ACTIVATION_PATH,token,'GET')
        rows=parse_envelope(status,raw).get('deployments')
        if not isinstance(rows,list) or not rows or rows[0].get('id')!=identifier or rows[0].get('versions')!=body['versions']:raise Held('POST_ACTIVATION_ALLOCATION_HELD')
        receipt['state']='ACTIVATED_ALLOCATION_READ_VERIFIED';receipt['allocationReadVerified']=True
        save('receipt.json',receipt);return receipt
    except Exception:
        save('receipt.json',receipt);raise Held('ACTIVATION_REQUIRES_READ_RECONCILIATION') from None
def main():
    if len(sys.argv)!=2 or sys.argv[1] not in ('prepare','activate'):raise Held('COMMAND_HELD')
    ctx=context();reader,plan=load_reader()
    if ''.join(os.environ.get('CLOUDFLARE_ACCOUNT_ID','').split())!=reader.ACCOUNT:raise Held('ACCOUNT_HELD')
    token=os.environ.get('CLOUDFLARE_API_TOKEN','');gh_token=os.environ.get('GH_TOKEN','')
    if not token or not gh_token or any(c in token+gh_token for c in '\r\n'):raise Held('TOKEN_FORMAT_HELD')
    if sys.argv[1]=='prepare':
        previous=github('/actions/artifacts?name='+ARTIFACT+'&per_page=100',gh_token)
        if previous.get('total_count')!=0 or previous.get('artifacts')!=[]:raise Held('PRIOR_ACTIVATION_INTENT_EXISTS')
        result=fresh_preflight(reader,plan,token,gh_token,ctx);save('preflight.json',result)
        intent={'context':ctx,'versionId':reader.SOURCE,'priorDeploymentId':EXPECTED_SOURCE,
            'createdUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'bodySha256':sha(canonical({'strategy':'percentage','versions':[{'version_id':reader.SOURCE,'percentage':100}]}))}
        save('intent.json',intent,exclusive=True);print('FIXED_ACTIVATION_PREFLIGHT_PASSED_INTENT_READY');return
    intent=json.loads((OUTPUT/'intent.json').read_text())
    if intent.get('context')!=ctx or intent.get('versionId')!=reader.SOURCE or intent.get('priorDeploymentId')!=EXPECTED_SOURCE:raise Held('INTENT_CONTEXT_HELD')
    if not 0<=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(intent['createdUtc'])).total_seconds()<180:raise Held('INTENT_AGE_HELD')
    artifact_id=os.environ.get('SP_INTENT_ARTIFACT_ID','');digest=os.environ.get('SP_INTENT_ARTIFACT_DIGEST','')
    if not artifact_id.isdigit() or not re.fullmatch('[a-f0-9]{64}',digest):raise Held('DURABLE_INTENT_RECEIPT_HELD')
    artifact=github('/actions/artifacts/'+artifact_id,gh_token)
    if artifact.get('name')!=ARTIFACT or artifact.get('expired') is not False or artifact.get('digest')!='sha256:'+digest or (artifact.get('workflow_run') or {}).get('id')!=ctx['runId']:raise Held('DURABLE_INTENT_IDENTITY_HELD')
    result=fresh_preflight(reader,plan,token,gh_token,ctx);save('immediate-prewrite-read.json',result)
    receipt=perform_activation(reader,token,intent);print(json.dumps(receipt,indent=2))

if __name__=='__main__':
    try:main()
    except Held as error:
        save('held.json',{'state':'HELD','reasonCode':str(error),'automaticRetryAuthorized':False});print('FIXED_ACTIVATION_HELD');raise SystemExit(2) from None
    except Exception:
        save('held.json',{'state':'HELD','reasonCode':'UNEXPECTED_INPUT_OR_TRANSPORT_HELD','automaticRetryAuthorized':False});print('FIXED_ACTIVATION_HELD');raise SystemExit(2) from None
