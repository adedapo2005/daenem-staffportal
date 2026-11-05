"""Fixed-target GET-only diagnosis. No uploader, preparation or mutation path."""
import copy,hashlib,json,os,re,sys,urllib.error,urllib.request
from pathlib import Path

REPO='adedapo2005/daenem-staffportal'
BRANCH='ops/staffportal-upload-preflight-read-20261105'
ACCOUNT='f322585f9882be1f55d8cf6dc7e77ee1'
WORKER='daenem-staffportal-api-staging'
SOURCE='47927e3c-827a-4b7a-842c-8bdd6e88883e'
ROOT='/workers/workers/'+WORKER
PATHS=(ROOT,ROOT+'/versions/'+SOURCE,'/workers/scripts/'+WORKER+'/settings',
       '/workers/scripts/'+WORKER+'/script-settings','/workers/scripts/'+WORKER+'/deployments')
API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
MAX=4*1024*1024
SAFE_REASONS={
    'exactly 31 bindings required':'BINDING_COUNT_HELD',
    'invalid or duplicate binding identity':'BINDING_IDENTITY_HELD',
    '31-binding name set differs':'BINDING_NAME_SET_DRIFT',
    'wrong or unresolved source inheritance':'SOURCE_INHERITANCE_HELD',
    'binding type drift':'BINDING_TYPE_DRIFT',
    'plain-text definition unavailable':'VARIABLE_DEFINITION_HELD',
    'database binding aliases disagree':'DATABASE_BINDING_IDENTITY_HELD',
    'binding resource, restriction or value drift':'BINDING_RESOURCE_OR_VALUE_DRIFT',
    'version runtime setting drift or missing value':'RUNTIME_SETTING_HELD',
    'default placement drift':'PLACEMENT_DRIFT',
    'shared logging setting unavailable or enabled':'SHARED_LOGGING_HELD',
    'observability is not effective off':'OBSERVABILITY_ENABLED_OR_UNKNOWN',
    'unexpected enabled observability subsystem':'OBSERVABILITY_SUBSYSTEM_HELD',
    'tail consumer drift':'TAIL_CONSUMER_DRIFT'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def send(path,token):
    if path not in PATHS:raise ValueError('OUTSIDE_FIXED_GET_SCOPE')
    request=urllib.request.Request(API+path,headers={'Authorization':'Bearer '+token,
        'Accept':'application/json','User-Agent':'StaffPortal-read-only-preflight'},method='GET')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
    try:response=opener.open(request,timeout=30)
    except urllib.error.HTTPError as error:response=error
    with response:return response.status,dict(response.headers),response.read(MAX+1)

class Held(Exception):pass

def ai_metadata_projection(raw):
    """Diagnostic-only probe of the observed project representation.

    The uploader and pinned production comparison remain unchanged/held.
    Opaque project data never leaves memory. This probe checks the remaining
    fixed reads after recording the original AI mismatch.
    """
    out=copy.deepcopy(raw);project=None;changed=False
    for row in out:
        if isinstance(row,dict) and row.get('name')=='AI' and row.get('type')=='ai' and 'project' in row:
            if set(row)!={'name','type','project'}:raise Held('AI_PROJECT_SCHEMA_HELD')
            project=row.pop('project');changed=True
    return out,project,changed

def binding_comparisons(raw,expected):
    """Fixed-name/field booleans only. Never export values, hashes or unknown keys."""
    known_fields={'name','type','id','database_id','bucket_name','namespace_id',
                  'queue_name','queue_id','allowed_sender_addresses','allowed_destination_addresses',
                  'destination_address','jurisdiction','staging','remote','text','asset_version',
                  'version','service','environment','entrypoint','account_id','api_token',
                  'project_name','namespace','internal_env'}
    out={}
    for want in expected:
        rows=[row for row in raw if isinstance(row,dict) and row.get('name')==want['name']]
        flags={'uniquePresent':len(rows)==1}
        if len(rows)==1:
            item=dict(rows[0]);extra=set(item)-set(want)
            if item.get('type')=='plain_text':
                text=item.pop('text',None)
                item['valueSha256']=hashlib.sha256(text.encode()).hexdigest() if isinstance(text,str) else None
                extra=set(item)-set(want)
            if item.get('type')=='d1':
                identity=item.get('id',item.get('database_id'))
                item['id']=item['database_id']=identity
                extra=set(item)-set(want)
            flags.update(typeMatches=item.get('type')==want['type'],
                expectedFieldsMatch={key:(key in item and item[key]==value) for key,value in want.items() if key!='name'},
                additionalKnownFields=sorted(extra & known_fields),
                unknownAdditionalFieldCount=len(extra-known_fields),
                additionalSchemaFieldNames=sorted(k for k in extra if re.fullmatch('[a-z][a-z0-9_]{0,39}',k)
                    and not re.fullmatch('[a-f0-9]{9,}',k) and not re.search('secret|token|password|authorization',k)),
                additionalNullFieldCount=sum(item[k] is None for k in extra),
                exactMatch=item==want)
            # Dynamic values have no pinned source hash. Report shape only.
            if want['type']=='plain_text' and 'valueSha256' not in want:
                flags['exactMatch']=set(item)==set(want)|{'valueSha256'} and flags['typeMatches']
        out[want['name']]=flags
    return out

def diagnose(token,plan,transport=send):
    result={'scope':'fixed existing Worker GETs only; no upload, preparation or database access',
            'state':'HELD','requests':[],'checks':[],'comparisonFailures':[],'mutationMethodsPermitted':False}
    def get(path):
        row={'method':'GET','path':path};result['requests'].append(row)
        try:
            status,headers,body=transport(path,token)
            row['status']=status
            row['rayId']=re.sub('[^A-Za-z0-9-]','',str(next((v for k,v in headers.items() if k.lower()=='cf-ray'),'')))[:80]
            if not isinstance(body,bytes) or len(body)>MAX:raise Held('RESPONSE_BOUND_HELD')
            data=json.loads(body)
            if isinstance(data,dict):row['providerErrorCodes']=[x['code'] for x in (data.get('errors') or []) if isinstance(x,dict) and type(x.get('code')) is int][:10]
            if status!=200 or not isinstance(data,dict) or data.get('success') is not True or not isinstance(data.get('result'),dict) or data.get('errors') not in (None,[]):raise Held('GET_RESPONSE_HELD')
            return data['result']
        except Held:raise
        except Exception as error:
            row['exceptionClass']=type(error).__name__ if type(error).__name__ in ('TimeoutError','URLError','ValueError','JSONDecodeError','OSError') else 'READ_ERROR'
            raise Held('GET_TRANSPORT_OR_PARSE_HELD') from None
    def check(stage,call):
        result['failureStage']=stage
        try:value=call()
        except Exception as error:
            code=str(error) if isinstance(error,Held) else SAFE_REASONS.get(str(error),'PINNED_COMPARISON_HELD')
            result['comparisonFailures'].append({'stage':stage,'reasonCode':code});return None
        result['checks'].append(stage)
        return value
    def require(condition,code):
        if not condition:raise Held(code)
    def runtime_shapes(value):
        expected=plan.projection().get('settings',{})
        return {key:{'present':key in value,'matchesPinned':key in value and value[key]==expected.get(key),
                     'isNull':key in value and value[key] is None,'isEmptyObject':key in value and value[key]=={},
                     'isEmptyList':key in value and value[key]==[]} for key in ('compatibility_date','compatibility_flags','limits','cache_options')}
    try:
        result['failureStage']='worker-get';worker=get(ROOT)
        expected=plan.projection()['access'];access=worker.get('subdomain')
        flags={'nameMatches':worker.get('name')==WORKER,
               'idWellFormed':isinstance(worker.get('id'),str) and bool(re.fullmatch('[A-Za-z0-9_-]{1,128}',worker['id'])),
               'subdomainObject':isinstance(access,dict),
               'accessMatches':isinstance(access,dict) and all(type(access.get(k)) is bool and access[k]==v for k,v in expected.items())}
        result['workerIdentityChecks']=flags
        if not all(flags.values()):raise Held('WORKER_IDENTITY_OR_ACCESS_HELD')
        result['checks'].append('worker-identity-access')
        result['failureStage']='source-version-get';source=get(ROOT+'/versions/'+SOURCE)
        if source.get('id')!=SOURCE:raise Held('SOURCE_VERSION_IDENTITY_HELD')
        result['sourceBindingCount']=len(source['bindings']) if isinstance(source.get('bindings'),list) else None
        if isinstance(source.get('bindings'),list):result['sourceBindingComparisons']=binding_comparisons(source['bindings'],plan.projection().get('bindings',[]))
        ignored,source_project,source_extra=ai_metadata_projection(source.get('bindings') or [])
        source_raw=source.get('bindings')
        result['aiProjectDiagnosticProbe']={'sourceExtraPresent':source_extra,'sourceProjectType':type(source_project).__name__ if source_extra else None,
            'productionGateChanged':False}
        source_bindings=check('source-bindings-diagnostic-projection',lambda:plan.binding_projection(source_raw))
        result['sourceRuntimeChecks']=runtime_shapes(source)
        check('source-runtime',lambda:plan.version_settings(source,version_read=True))
        result['failureStage']='settings-get';settings=get(PATHS[2])
        result['currentBindingCount']=len(settings['bindings']) if isinstance(settings.get('bindings'),list) else None
        ignored,current_project,current_extra=ai_metadata_projection(settings.get('bindings') or [])
        current_raw=settings.get('bindings')
        result['aiProjectDiagnosticProbe'].update(currentExtraPresent=current_extra,
            currentProjectType=type(current_project).__name__ if current_extra else None,
            valuesEqualWhenBothPresent=(source_project==current_project if source_extra and current_extra else None))
        check('ai-project-equality',lambda:require(not(source_extra and current_extra) or source_project==current_project,'AI_PROJECT_METADATA_DIFFERENT'))
        current_bindings=check('current-bindings-diagnostic-projection',lambda:plan.binding_projection(current_raw))
        result['currentRuntimeChecks']=runtime_shapes(settings)
        check('current-runtime',lambda:plan.version_settings(settings))
        check('current-placement',lambda:require(settings.get('placement')=={},'CURRENT_PLACEMENT_HELD'))
        if source_bindings is not None and current_bindings is not None:check('source-current-bindings',lambda:require(source_bindings==current_bindings,'SOURCE_CURRENT_BINDINGS_DIFFER'))
        result['failureStage']='script-settings-get';script=get(PATHS[3])
        check('shared-settings',lambda:plan.shared_settings(worker,script))
        result['failureStage']='deployment-get';deployments=get(PATHS[4]).get('deployments')
        if not isinstance(deployments,list) or not deployments:
            result['comparisonFailures'].append({'stage':'deployment-allocation','reasonCode':'DEPLOYMENT_RESPONSE_HELD'})
        else:
            first=deployments[0];want=plan.expected_current()
            check('deployment-allocation',lambda:require(first.get('id')==want['deployment'] and first.get('versions')==want['versions'],'DEPLOYMENT_ALLOCATION_DRIFT'))
        if result['comparisonFailures']:
            first=result['comparisonFailures'][0];result['failureStage']=first['stage'];result['reasonCode']=first['reasonCode']
        else:
            result.pop('failureStage',None);result['state']='READ_CANDIDATE_PREFLIGHT_MATCHED'
    except Held as error:result['reasonCode']=str(error)
    raw=json.dumps(result,indent=2)
    if token and token in raw:raise Held('SANITIZATION_HELD')
    return result

def main():
    expected={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':REPO,'GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'pull_request_review'}
    if any(os.environ.get(k)!=v for k,v in expected.items()):raise Held('CONTEXT_HELD')
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    if event.get('pull_request',{}).get('head',{}).get('ref')!=BRANCH:raise Held('BRANCH_HELD')
    if ''.join(os.environ.get('CLOUDFLARE_ACCOUNT_ID','').split())!=ACCOUNT:raise Held('ACCOUNT_HELD')
    token=os.environ.get('CLOUDFLARE_API_TOKEN','')
    if not token or any(c in token for c in '\r\n'):raise Held('TOKEN_FORMAT_HELD')
    root=Path(__file__).resolve().parents[2]/'ops/staffportal-release-executor'
    pins=root/'RUNTIME-PINS.json'
    if hashlib.sha256(pins.read_bytes()).hexdigest()!='33b8903ebe37265deb8771f6e266bfdc88845ceeebda02623e049ef2fbae2c6f':raise Held('RUNTIME_PINS_HELD')
    for name,pin in json.loads(pins.read_text())['files'].items():
        if Path(name).name!=name or hashlib.sha256((root/'runtime'/name).read_bytes()).hexdigest()!=pin:raise Held('RUNTIME_SOURCE_HELD')
    sys.dont_write_bytecode=True;sys.path.insert(0,str(root/'runtime'))
    import importlib.util
    helper=Path(__file__).with_name('staffportal_read_candidate_plan.py')
    if hashlib.sha256(helper.read_bytes()).hexdigest()!='8eda702ae97d7273d8142a2fd6c5b611676480f560e4c97438e8e78906262ed1':raise Held('CANDIDATE_READ_SOURCE_HELD')
    spec=importlib.util.spec_from_file_location('reviewed_read_candidate',helper)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    # Pure read comparisons only. No adapter or publisher is instantiated.
    result=diagnose(token,module.CandidateReadPlan(None))
    result['candidateComparisonOnly']=True
    raw=json.dumps(result,indent=2);Path('staffportal-upload-preflight-read.json').write_text(raw);print(raw)

if __name__=='__main__':
    try:main()
    except Exception:
        print('READ_ONLY_PREFLIGHT_DIAGNOSTIC_HELD');raise SystemExit(2) from None
