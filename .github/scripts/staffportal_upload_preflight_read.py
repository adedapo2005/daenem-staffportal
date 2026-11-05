"""Fixed GET-only verification of the already created StaffPortal version.

No publisher, uploader, window preparation or application requests are invoked.
Provider responses and binding values remain in memory; output is an allowlist.
"""
import base64,hashlib,json,os,re,sys,urllib.error,urllib.request,urllib.parse
from pathlib import Path

REPO='adedapo2005/daenem-staffportal'
BRANCH='ops/staffportal-preserved-candidate-read-20261105'
ACCOUNT='f322585f9882be1f55d8cf6dc7e77ee1'
WORKER='daenem-staffportal-api-staging'
SOURCE='47927e3c-827a-4b7a-842c-8bdd6e88883e'
TARGET='8e7ead65-59c2-4856-ac1c-3ba63eb8f77e'
ROOT='/workers/workers/'+WORKER
PATHS=(ROOT,ROOT+'/versions/'+SOURCE,ROOT+'/versions/'+TARGET,
       ROOT+'/versions/'+TARGET+'?include=modules',
       '/workers/scripts/'+WORKER+'/script-settings',
       '/workers/scripts/'+WORKER+'/deployments')
API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
MAX=16*1024*1024
REQUEST_SHA='5c0f1637bd4e83b5ec5d0542d857fdf95e2ef5710f47de140eca54f52fea8d10'
WORKER_SHA='d63750041287fa412066ec4509b08bfa21dc7632dc61ae1458201a5023ee0b41'
PINS_SHA='03d278600727236fd0ccb78a65df7e8e83c703d4b869a9c25e812fcca13ad7a1'
DYNAMIC={'SP_EFFECT_OPERATOR_SHA256','SP_EFFECT_OPERATOR_EXPIRES_AT'}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()
class Held(Exception):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def send(path,token):
    if path not in PATHS:raise Held('OUTSIDE_FIXED_GET_SCOPE')
    request=urllib.request.Request(API+path,headers={'Authorization':'Bearer '+token,
        'Accept':'application/json','User-Agent':'StaffPortal-created-version-read-verification'},method='GET')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
    try:response=opener.open(request,timeout=30)
    except urllib.error.HTTPError as error:response=error
    with response:return response.status,response.read(MAX+1)

class ReadValues:
    """Private comparison inputs, anchored by the retained request hash.

    Intentionally has no authority, window check, capability or write methods.
    """
    def __init__(self,bindings):
        if not isinstance(bindings,list):raise Held('TARGET_BINDINGS_MALFORMED')
        self._values={}
        for name in DYNAMIC:
            rows=[b for b in bindings if isinstance(b,dict) and b.get('name')==name]
            if len(rows)!=1 or set(rows[0])!={'name','type','text'} or rows[0]['type']!='plain_text' or not isinstance(rows[0]['text'],str):raise Held('DYNAMIC_COMPARISON_INPUT_HELD')
            self._values[name]=rows[0]['text']
    def values(self):return dict(self._values)
    def value_pins(self):return {k:sha(v.encode()) for k,v in self._values.items()}

def routing_checks(config,want):
    if not isinstance(config,dict):return {'objectPresent':False,'semanticMatch':False,'exactMatch':False}
    extra=set(config)-set(want)
    defaults={'html_handling':'auto-trailing-slash','base_path':'/'}
    pinned=all(k in config and type(config[k]) is type(v) and config[k]==v for k,v in want.items())
    return {'objectPresent':True,'pinnedFieldsMatch':pinned,'exactMatch':config==want,
        'additionalDocumentedFields':sorted(extra & set(defaults)),
        'unknownAdditionalFieldCount':len(extra-set(defaults)),
        'htmlHandlingIsDocumentedDefault':config.get('html_handling',defaults['html_handling'])==defaults['html_handling'],
        'basePathIsRoot':config.get('base_path','/')=='/',
        'semanticMatch':pinned and extra<=set(defaults) and all(config[k]==defaults[k] for k in extra)}

def module_checks(version):
    modules=version.get('modules')
    out={'propertyPresent':'modules' in version,'singleModule':isinstance(modules,list) and len(modules)==1}
    if not out['singleModule']:return out
    item=modules[0]
    if not isinstance(item,dict):return out
    out.update(nameMatches=item.get('name')=='worker.mjs',typeMatches=item.get('content_type')=='application/javascript+module',
        contentPresent=isinstance(item.get('content_base64'),str),unknownFieldCount=len(set(item)-{'name','content_type','content_base64'}))
    try:raw=base64.b64decode(item['content_base64'],validate=True);out['codeSha256Matches']=sha(raw)==WORKER_SHA
    except (ValueError,KeyError,TypeError):out['codeSha256Matches']=False
    return out

def safe_version_urls(raw):
    if not isinstance(raw,list) or len(raw)>10:return []
    out=[]
    pattern=r'(?:8e7ead65--?daenem-staffportal-api-staging|daenem-staffportal-api-staging--?8e7ead65)\.adedapo2005\.workers\.dev'
    for value in raw:
        if not isinstance(value,str) or len(value)>300:continue
        u=urllib.parse.urlsplit(value)
        try:port=u.port
        except ValueError:continue
        if u.scheme=='https' and u.path in ('','/') and not u.query and not u.fragment and not u.username and not u.password and port is None and re.fullmatch(pattern,u.hostname or ''):out.append(value)
    return out

def diagnose(token,plan_type,transport=send):
    result={'state':'HELD','versionId':TARGET,'uploadRunId':42113465988,
        'scope':'six fixed existing Worker GETs after return; existing candidate URL diagnosis only; no upload, activation or database access',
        'mutationMethodsPermitted':False,'requests':[],'checks':{},'comparisonFailures':[]}
    def get(path):
        row={'method':'GET','path':path};result['requests'].append(row)
        status,raw=transport(path,token);row['status']=status
        if not isinstance(raw,bytes) or len(raw)>MAX:raise Held('RESPONSE_BOUND_HELD')
        try:data=json.loads(raw)
        except (ValueError,UnicodeError):raise Held('RESPONSE_JSON_HELD') from None
        if isinstance(data,dict):row['providerErrorCodes']=[x['code'] for x in (data.get('errors') or []) if isinstance(x,dict) and type(x.get('code')) is int][:10]
        if status!=200 or not isinstance(data,dict) or data.get('success') is not True or data.get('errors') not in (None,[]) or not isinstance(data.get('result'),dict):raise Held('GET_RESPONSE_HELD')
        return data['result']
    def check(name,fn):
        try:passed=fn() is not False
        except Exception:passed=False
        result['checks'][name]=passed
        if not passed:result['comparisonFailures'].append(name)
        return passed
    try:
        worker=get(PATHS[0]);source=get(PATHS[1]);target=get(PATHS[2])
        expanded=get(PATHS[3]);script=get(PATHS[4]);deployments=get(PATHS[5])
        plan=plan_type(ReadValues(target.get('bindings')))
        projection=plan.projection()
        check('version-identities',lambda:source.get('id')==SOURCE and target.get('id')==TARGET and expanded.get('id')==TARGET)
        access=worker.get('subdomain')
        check('worker-identity-access',lambda:worker.get('name')==WORKER and isinstance(worker.get('id'),str)
            and re.fullmatch('[A-Za-z0-9_-]{1,128}',worker['id']) is not None and isinstance(access,dict)
            and all(type(access.get(k)) is bool and access[k]==v for k,v in projection['access'].items()))
        check('retained-request-metadata-hash',lambda:sha(canonical(plan.version_metadata()))==REQUEST_SHA)
        check('source-bindings',lambda:plan.binding_projection(source.get('bindings')))
        check('target-bindings',lambda:plan.binding_projection(target.get('bindings'),target=True))
        check('expanded-target-bindings',lambda:plan.binding_projection(expanded.get('bindings'),target=True))
        for label,version in (('source',source),('target',target),('expanded-target',expanded)):
            check(label+'-runtime',lambda v=version:plan.version_settings(v,version_read=True))
        result['routing']=routing_checks(target.get('assets',{}).get('config'),projection['assetConfig'])
        check('target-asset-routing',lambda:result['routing']['semanticMatch'])
        check('expanded-target-metadata-consistency',lambda:{k:v for k,v in target.items() if k!='modules'}=={k:v for k,v in expanded.items() if k!='modules'})
        result['defaultResponseModuleShape']=module_checks(target)
        result['moduleVerification']=module_checks(expanded)
        check('target-module-bytes',lambda:all(result['moduleVerification'].get(k) is True for k in
            ('singleModule','nameMatches','typeMatches','contentPresent','codeSha256Matches')) and result['moduleVerification'].get('unknownFieldCount')==0)
        check('shared-settings',lambda:plan.shared_settings(worker,script))
        rows=deployments.get('deployments');want=plan.expected_current()
        check('prior-serving-after-return',lambda:isinstance(rows,list) and bool(rows) and rows[0].get('id')=='b2009248-b0b6-4019-9ae6-812569fde8fb' and rows[0].get('versions')==[{'version_id':SOURCE,'percentage':100}])
        result['servingDeploymentId']='b2009248-b0b6-4019-9ae6-812569fde8fb'
        result['servingVersionId']=SOURCE
        result['targetAllocated']=any(isinstance(v,dict) and v.get('version_id')==TARGET and v.get('percentage',0)>0 for v in (rows[0].get('versions',[]) if isinstance(rows,list) and rows and isinstance(rows[0],dict) else []))
        check('candidate-not-serving',lambda:result['targetAllocated'] is False)
        urls=target.get('urls')
        result['candidateVersionUrls']=safe_version_urls(urls)
        check('existing-candidate-version-url',lambda:len(result['candidateVersionUrls'])==1)
        if not result['comparisonFailures']:result['state']='PRESERVED_CANDIDATE_READ_VERIFIED_PRIOR_VERSION_SERVING'
    except Held as error:result['reasonCode']=str(error)
    except Exception:result['reasonCode']='READ_OR_SCHEMA_HELD'
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
    if sha(pins.read_bytes())!=PINS_SHA:raise Held('RUNTIME_PINS_HELD')
    for name,pin in json.loads(pins.read_text())['files'].items():
        if Path(name).name!=name or sha((root/'runtime'/name).read_bytes())!=pin:raise Held('RUNTIME_SOURCE_HELD')
    sys.dont_write_bytecode=True;sys.path.insert(0,str(root/'runtime'))
    from workers_api_plan import WorkersAPIPlan
    result=diagnose(token,WorkersAPIPlan)
    Path('staffportal-upload-preflight-read.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    try:main()
    except Exception:
        print('CREATED_VERSION_READ_VERIFICATION_HELD');raise SystemExit(2) from None
