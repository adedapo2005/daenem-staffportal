"""Three fixed GETs to reconcile one Issues-off PATCH. No write transport."""
import json,os,re,urllib.request,urllib.error
from pathlib import Path
ACCOUNT='f322585f9882be1f55d8cf6dc7e77ee1';WORKER='daenem-staffportal-api-staging'
API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
PATHS=['/workers/workers/'+WORKER,'/workers/scripts/'+WORKER+'/script-settings','/workers/scripts/'+WORKER+'/deployments']
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**kw):return None
def main():
    wanted={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':'adedapo2005/daenem-staffportal','GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'pull_request_review'}
    assert all(os.environ.get(k)==v for k,v in wanted.items())
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    assert event['pull_request']['head']['ref']=='ops/staffportal-upload-preflight-read-20261105'
    assert event['review']['body']=='STAFFPORTAL READ CORRECTED SETTINGS 42148842172; GET ONLY'
    assert ''.join(os.environ['CLOUDFLARE_ACCOUNT_ID'].split())==ACCOUNT
    token=os.environ['CLOUDFLARE_API_TOKEN'];assert token and not any(c in token for c in '\r\n')
    output={'state':'HELD','scope':'Three Fixed GETs Only; Reconcile Issues-Off PATCH From Run42148842172','requests':[],'writesPermitted':False}
    values=[]
    try:
        for path in PATHS:
            request=urllib.request.Request(API+path,method='GET',headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
            try:response=opener.open(request,timeout=30)
            except urllib.error.HTTPError as error:response=error
            with response:status,raw=response.status,response.read(16*1024*1024+1)
            output['requests'].append({'method':'GET','path':path,'status':status})
            assert status==200 and len(raw)<=16*1024*1024
            obj=json.loads(raw);assert obj.get('success') is True and obj.get('errors') in (None,[]) and isinstance(obj.get('result'),dict)
            values.append(obj['result'])
        worker,script,deployments=values
        assert worker.get('name')==WORKER
        output['shared']={label:{key:obj.get(key) for key in ['observability','logpush','tail_consumers']} for label,obj in [('worker',worker),('script',script)]}
        rows=deployments.get('deployments');assert isinstance(rows,list) and rows
        output['latestDeployment']={key:rows[0].get(key) for key in ['id','versions']}
        output['state']='THREE_FIXED_GETS_COMPLETED'
    except Exception:output['reasonCode']='FIXED_SETTINGS_READ_HELD'
    raw=json.dumps(output,indent=2);assert token not in raw
    Path('staffportal-corrected-settings-read.json').write_text(raw+'\n');print(raw)
if __name__=='__main__':main()
