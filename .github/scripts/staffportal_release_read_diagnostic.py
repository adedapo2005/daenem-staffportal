"""Fixed GitHub release metadata reads. No downloads, redirects or mutations."""
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

REPO='adedapo2005/daenem-staffportal'
ROOT=f'/repos/{REPO}'
PATHS=(ROOT+'/releases/434713012',ROOT+'/releases/434713012/assets?per_page=100&page=1',
       ROOT+'/releases/assets/713554200',ROOT+'/releases/assets/713553260')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def send(path,token):
    if path not in PATHS:raise ValueError('outside fixed read scope')
    request=urllib.request.Request('https://api.github.com'+path,
        headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
                 'X-GitHub-Api-Version':'2022-11-28','User-Agent':'StaffPortal-fixed-read-diagnostic'},method='GET')
    try:
        response=urllib.request.build_opener(NoRedirect).open(request,timeout=20)
    except urllib.error.HTTPError as error:response=error
    with response:return response.status,dict(response.headers),response.read(65537)

def text(value,token):
    value=str(value).replace(token,'[redacted]') if token else str(value)
    return re.sub(r'https?://\S+','[url]',value)[:300]

def inspect(token,transport=send):
    results=[]
    for path in PATHS:
        result={'method':'GET','origin':'https://api.github.com','path':path.split('?')[0]}
        try:
            status,headers,body=transport(path,token)
            headers={k.lower():v for k,v in headers.items()}
            result.update(status=status,requestId=text(headers.get('x-github-request-id',''),token),
                acceptedPermissions=text(headers.get('x-accepted-github-permissions',''),token))
            data=json.loads(body) if len(body)<=65536 else None
            if status==200:
                if isinstance(data,list):
                    ids={row.get('id') for row in data if isinstance(row,dict)}
                    result['expectedAssetsPresent']={'application':713554200 in ids,'operator':713553260 in ids}
                elif isinstance(data,dict):
                    if type(data.get('id')) is int:result['returnedId']=data['id']
                    if data.get('id')==434713012:
                        if type(data.get('draft')) is bool:result['draft']=data['draft']
                    else:result['assetUploaded']=data.get('state')=='uploaded'
            elif isinstance(data,dict):result['message']=text(data.get('message',''),token)
        except Exception as error:
            result['readErrorType']=type(error).__name__
        results.append(result)
    raw=json.dumps({'scope':'fixed GitHub metadata only; no Cloudflare or mutation',
                    'declaredPermissions':{'contents':'write','actions':'read'},'requests':results},indent=2)
    if token and token in raw:raise ValueError('unsafe diagnostic output')
    return raw


def preflight(token,transport=send,executor_path=None):
    """Use the unchanged hash-pinned production fetcher; no upload entry point."""
    raw=inspect(token,transport)
    result=json.loads(raw)
    if any(row.get('status')!=200 or row.get('readErrorType')
           for row in result['requests']):
        raise RuntimeError('INPUT_METADATA_ACCESS_HELD')
    if result['requests'][0].get('returnedId')!=434713012 or result['requests'][0].get('draft') is not True:
        raise RuntimeError('INPUT_RELEASE_IDENTITY_HELD')
    if result['requests'][1].get('expectedAssetsPresent')!={'application':True,'operator':True}:
        raise RuntimeError('INPUT_ASSET_SET_HELD')
    if any(row.get('returnedId')!=aid or row.get('assetUploaded') is not True
           for row,aid in zip(result['requests'][2:],(713554200,713553260))):
        raise RuntimeError('INPUT_ASSET_IDENTITY_HELD')
    import hashlib
    import importlib.util
    import tempfile
    executor_path=executor_path or Path(__file__).resolve().parents[2]/'ops/staffportal-release-executor/release_executor.py'
    if hashlib.sha256(executor_path.read_bytes()).hexdigest()!='c3ffc3c682ce76f0cb3e1a28b4d234f9aaf80a9c36cfcf357224c9fcab07afce':
        raise RuntimeError('REVIEWED_FETCHER_CHANGED')
    spec=importlib.util.spec_from_file_location('reviewed_input_fetcher',executor_path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='staffportal-input-preflight-') as temporary:
        inputs=module.fetch_inputs(module.GitHubReader({'GH_TOKEN':token}),
            '713554200','713553260',
            'f35df1145b815eafed75166a347013ced98d580388832a649e63ca05f0162994',
            Path(temporary)/'inputs')
    return {'state':'INPUT_DOWNLOAD_AND_HASH_VERIFIED','inputs':inputs,
            'cloudflareCalls':0,'preparationPerformed':False,'uploadPerformed':False}

def main():
    if any(os.environ.get(k)!=v for k,v in {'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':REPO,
            'GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'pull_request_review'}.items()):raise SystemExit('DIAGNOSTIC_CONTEXT_HELD')
    token=os.environ.get('GH_TOKEN','')
    if not token or os.environ.get('CLOUDFLARE_API_TOKEN'):raise SystemExit('DIAGNOSTIC_CREDENTIAL_SCOPE_HELD')
    raw=json.dumps(preflight(token),indent=2)
    Path('staffportal-input-read-diagnostic.json').write_text(raw,encoding='utf-8')
    print(raw)

if __name__=='__main__':
    try:main()
    except Exception:
        print('INPUT_PREFLIGHT_HELD')
        raise SystemExit(2) from None
