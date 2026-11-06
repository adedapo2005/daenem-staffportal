from pathlib import Path
import hashlib,json,zipfile,urllib.request,urllib.error,urllib.parse,concurrent.futures,datetime
r=Path(r'D:\DAENEM-QA\staffportal-personal-services-release-20261106');origin='https://daenem-staffportal-api-staging.adedapo2005.workers.dev'
pins=json.loads((r/'PUBLISHED-PACKAGE-PINS.json').read_text())
assert hashlib.sha256((r/pins['assetName']).read_bytes()).hexdigest()==pins['archive']
with zipfile.ZipFile(r/pins['assetName']) as z:manifest=json.loads(z.read('asset-manifest.json'))
assert manifest['count']==pins['count']
receipt=json.loads((r/'activation-receipt.json').read_text());assert receipt['state']=='ACTIVATED_ALLOCATION_READ_VERIFIED'
redirects={'/index.html':'/','/privacy-policy.html':'/privacy-policy','/signin-credits.html':'/signin-credits','/terms-and-conditions.html':'/terms-and-conditions'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def read(entry):
 path=entry['path'];url=origin+path;hops=[]
 try:
  for _ in range(3):
   request=urllib.request.Request(url,headers={'User-Agent':'StaffPortal-static-delivery-acceptance','Cache-Control':'no-cache'});opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
   try:response=opener.open(request,timeout=30)
   except urllib.error.HTTPError as error:response=error
   with response:status=response.status;location=response.headers.get('Location');raw=response.read(entry['bytes']+1)
   hops.append({'status':status,'path':urllib.parse.urlsplit(url).path})
   if status in (301,302,307,308):
    assert path in redirects and isinstance(location,str)
    target=urllib.parse.urljoin(url,location);parsed=urllib.parse.urlsplit(target)
    assert parsed.scheme=='https' and parsed.netloc==urllib.parse.urlsplit(origin).netloc and parsed.path==redirects[path] and not parsed.query and not parsed.fragment
    url=target;continue
   return {'path':path,'status':status,'hops':hops,'byteCountMatches':len(raw)==entry['bytes'],'sha256Matches':hashlib.sha256(raw).hexdigest()==entry['sha256']}
  return {'path':path,'verified':False,'reason':'REDIRECT_LIMIT'}
 except Exception:return {'path':path,'verified':False,'reason':'STATIC_GET_OR_CANONICAL_REDIRECT_FAILED'}
result={'state':'RUNNING','scope':'GET-only static delivery; four previously verified same-origin HTML canonical redirects permitted','archiveSha256':pins['archive'],'servingReceipt':receipt,'paths':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for row in pool.map(read,manifest['files']):
  result['paths'].append(row)
  if len(result['paths'])%50==0:print('VERIFIED',len(result['paths']),'OF',pins['count'],flush=True)
result['state']='ALL_DELIVERED_ASSETS_MATCH' if len(result['paths'])==pins['count'] and all(x.get('status')==200 and x.get('byteCountMatches') and x.get('sha256Matches') for x in result['paths']) else 'DELIVERY_ACCEPTANCE_HELD'
result['completedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(r/'delivered-assets.json').write_text(json.dumps(result,indent=2));print(json.dumps({'state':result['state'],'count':len(result['paths']),'mismatches':[x['path'] for x in result['paths'] if not x.get('sha256Matches')]}),flush=True)
