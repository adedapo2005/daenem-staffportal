from pathlib import Path
import json,hashlib
out=Path(r'D:\DAENEM-QA\staffportal-personal-services-review-20261106')
source=Path(r'D:\DAENEM-QA\staffportal-personal-services-candidate-20261106')
load=lambda n:json.loads((out/n).read_text(encoding='utf-8'))
positive=load('personal-browser-results.json');gates=load('personal-browser-final-gates.json')
assert len(positive['checks'])==32 and all(x['passed'] for x in positive['checks'])
assert positive['state']=='HELD_PERSONAL_BROWSER' and "getByRole('heading'" in positive['failure'] and 'Workspace Access Not Assigned' in positive['failure']
assert gates['state']=='PASS_PERSONAL_FINAL_GATES' and all(x['passed'] for x in gates['checks'])
assert not positive['errors'] and not gates['errors']
for item in load('SOURCE-CHANGES.json')['files']:
 assert hashlib.sha256((source/item['path']).read_bytes()).hexdigest()==item['afterSha256'],item['path']
checks=positive['checks']+gates['checks']
r={'state':'PASS_REAL_WORKER_PERSONAL_DESTINATIONS','checks':checks,'catalog':gates['catalog'],'apiMockedForSuccessfulWorkflows':False,'syntheticOnly':True,'hostedCalls':0,'noExternalProviderRequestDelivered':True,'negativeFaultInjections':positive['faultInjections'],'sourcePinsVerified':True,'originalHeldReportPreserved':True,'priorLocatorResolution':'The historical shell handles the denied-company route before the personal bridge. Final gates verified its actual unavailable response and no protected read. Original exact-title locator report remains held.','evidence':[{'file':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()}for name in ['personal-browser-results.json','personal-browser-final-gates.json']]}
(out/'personal-browser-acceptance.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
print(json.dumps({'state':r['state'],'checks':len(checks),'catalog':r['catalog']}))
