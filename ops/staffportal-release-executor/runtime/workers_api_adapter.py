"""Workers API JSON version creation on the EXISTING fixed StaffPortal Worker.

Reuses the unchanged asset HTTP/multipart adapter. No Worker creation, deploy,
shared-setting mutation, implicit latest inheritance or retry path exists here.
"""
import base64
import hashlib
import json
import re
from baseline_contract import canonical, SOURCE_VERSION
from cloudflare_adapter import CloudflareAdapter, VERSION, http_send
from publisher import ACCOUNT, WORKER, Stop, Uncertain
from workers_api_plan import WorkersAPIPlan

ROOT='/workers/workers/'+WORKER

class WorkersAPIAdapter(CloudflareAdapter):
    def __init__(self, api_token, window, send=http_send, *, plan=None):
        self.plan=plan if plan is not None else WorkersAPIPlan(window)
        if self.plan.window is not window:
            raise Stop('plan and prepared window differ')
        super().__init__(api_token,self.plan.version_metadata(),send,baseline=self.plan)
        self._first_guard=None
        self._last_guard=None
        self._verified_version=None
        self._checked_worker_sha=None
        self._checked_manifest=None

    def read_version(self, version):
        if not isinstance(version,str) or not VERSION.fullmatch(version):
            raise Stop('explicit version identity required; latest is forbidden')
        result=self._call('GET',ROOT+'/versions/'+version,self._token)[1]
        if result.get('id')!=version: raise Stop('version lookup returned another source')
        return result

    def _worker(self):
        # A 404 is terminal; there is no POST to a Worker collection endpoint.
        worker=self._call('GET',ROOT,self._token)[1]
        if worker.get('name')!=WORKER or not isinstance(worker.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',worker['id']):
            raise Stop('existing Worker identity not established')
        access=worker.get('subdomain')
        expected=self.plan.projection()['access']
        if not isinstance(access,dict) or any(type(access.get(k)) is not bool or access[k]!=v for k,v in expected.items()):
            raise Stop('Worker access/version URL setting drift')
        return worker

    def _observe(self):
        self.plan.invalidate()
        self.plan.window.check(self.plan.clock)
        worker=self._worker()
        source=self.read_version(SOURCE_VERSION)
        source_bindings=self.plan.binding_projection(source.get('bindings'))
        source_settings=self.plan.version_settings(source,version_read=True)
        settings=self._call('GET','/workers/scripts/'+WORKER+'/settings',self._token)[1]
        current_bindings=self.plan.binding_projection(settings.get('bindings'))
        current_settings=self.plan.version_settings(settings)
        if canonical(current_bindings)!=canonical(source_bindings):
            raise Stop('current and explicit source bindings differ')
        if settings.get('placement')!={}: raise Stop('current placement unavailable or changed')
        script=self._call('GET','/workers/scripts/'+WORKER+'/script-settings',self._token)[1]
        shared=self.plan.shared_settings(worker,script)
        current=self.current()
        if current!=self.plan.expected_current():
            raise Stop('deployment/source allocation drift')
        # Semantic shared settings are compared; approved null/explicit-off
        # representation differences are retained separately, not called drift.
        proof={'workerId':worker['id'],'workerName':WORKER,'sourceVersionId':SOURCE_VERSION,
               'sourceBindings':source_bindings,'sourceSettings':source_settings,
               'currentSettings':current_settings,'deployment':current,
               'shared':{k:v for k,v in shared.items() if k!='representations'},
               'access':self.plan.projection()['access']}
        fingerprint=hashlib.sha256(canonical(proof)).hexdigest()
        if self._first_guard is not None and self._first_guard!=fingerprint:
            raise Stop('execution baseline changed between drift checks')
        self._first_guard=fingerprint
        summary={'fingerprint':fingerprint,'workerId':worker['id'],'workerName':WORKER,
                 'sourceVersionId':SOURCE_VERSION,'baselineSha256':self.plan.identity_sha256(),
                 'checkedAtUtc':self.plan.clock().isoformat(),
                 'preparedWindowSha256':self.plan.window.record_sha256,
                 'preparedConfigSha256':self.plan.window.config_sha256,
                 'observabilityRepresentations':shared['representations'],
                 'meaning':'point-in-time authenticated read comparisons; not an atomic provider fence'}
        self.plan._proof=summary
        self._last_guard=summary
        self.plan.assert_publishable()
        return json.loads(json.dumps(summary))

    def preflight(self, pkg):
        self.plan.invalidate()
        self.plan.validate_package(pkg)
        self._checked_worker_sha=hashlib.sha256(pkg['worker']).hexdigest()
        self._checked_manifest=json.loads(json.dumps(pkg['manifest']))
        self.plan.validate_metadata(self._metadata)
        return self._observe()

    def compare_current_baseline(self, operator_value_sha256=None):
        # Values are derived from the prepared window, never arbitrary caller pins.
        if operator_value_sha256 is not None and operator_value_sha256!=self.plan.window.value_pins():
            raise Stop('operator pins differ from prepared window')
        return self._observe()

    def start_assets(self, manifest):
        if self._checked_manifest is None or manifest!=self._checked_manifest:
            raise Stop('asset manifest differs from checked application package')
        return super().start_assets(manifest)

    def upload_bucket(self, jwt, files):
        self.plan.window.check(self.plan.clock)
        return super().upload_bucket(jwt,files)

    def upload_version(self, worker, config, jwt, identity):
        if config.get('account_id')!=ACCOUNT or config.get('name')!=WORKER:
            raise Stop('wrong fixed Worker target')
        if not isinstance(identity,str) or not re.fullmatch('[0-9a-f]{64}',identity):
            raise Stop('invalid upload association identity')
        if self._state!='complete' or not isinstance(jwt,str) or hashlib.sha256(jwt.encode()).hexdigest()!=self._completion:
            raise Stop('documented asset completion missing or version already attempted')
        if self._checked_worker_sha is None or hashlib.sha256(worker).hexdigest()!=self._checked_worker_sha:
            raise Stop('Worker module differs from checked application package')
        self.plan.validate_metadata(self._metadata)
        # Repeat all current/source/shared checks immediately before version POST.
        # The remote API does not offer an atomic CAS with deployment/settings.
        proof=self._observe()
        self.plan.assert_publishable()
        meta=json.loads(json.dumps(self._metadata))
        meta['assets']['jwt']=jwt
        meta['annotations']={'workers/message':'staffportal-review-'+identity}
        meta['modules']=[{'name':'worker.mjs','content_type':'application/javascript+module',
                          'content_base64':base64.b64encode(worker).decode('ascii')}]
        self._state='version-pending'
        status,result=self._call('POST',ROOT+'/versions?deploy=false',self._token,
                                  json.dumps(meta,separators=(',',':')).encode(),'application/json',statuses=(200,201))
        version=result.get('id')
        if not isinstance(version,str) or not VERSION.fullmatch(version) or version==SOURCE_VERSION:
            raise Uncertain('new version identity not established')
        self._state='version-returned'
        self._evidence={'version_id':version,'manifest':self._manifest,
             'completion':{'mode':'session-empty' if not self._buckets else 'final-bucket-201','responses':self._progress},
             'association':{'requestIdentity':identity,'workerSha256':hashlib.sha256(worker).hexdigest(),
                            'metadataWithoutTokenSha256':hashlib.sha256(canonical(self._metadata)).hexdigest(),
                            'versionResponseHttpStatus':status,'completionTokenSubmitted':True},
             'baselineSha256':self.plan.identity_sha256(),'delivered_bytes':'unverified'}
        # Retain ID before any post-upload reads. Journal saves it and this
        # association before calling verify_upload(). Lost reads never re-POST.
        self._created_proof=proof
        return {'version_id':version}

    def verify_upload(self, version, pkg):
        if self._state!='version-returned' or self._evidence is None or self._evidence['version_id']!=version:
            raise Stop('no matching returned version to verify')
        self.plan.window.check(self.plan.clock)
        source=self.read_version(version)
        self.plan.binding_projection(source.get('bindings'),target=True)
        self.plan.version_settings(source,version_read=True)
        assets=source.get('assets')
        if not isinstance(assets,dict) or assets.get('config')!=self.plan.projection()['assetConfig']:
            raise Stop('uploaded asset routing differs from approved plan')
        # Optional modules may be returned by this endpoint. Do not translate an
        # absent module, etag or completion token into delivered-byte evidence.
        module_status='not returned; submitted module bytes remain locally pinned'
        if 'modules' in source:
            modules=source['modules']
            if not isinstance(modules,list) or len(modules)!=1:
                raise Stop('unexpected uploaded module collection')
            module=modules[0]
            if module.get('name')!='worker.mjs' or module.get('content_type')!='application/javascript+module':
                raise Stop('unexpected uploaded main module')
            try: raw=base64.b64decode(module['content_base64'],validate=True)
            except (ValueError,KeyError,TypeError): raise Stop('invalid returned module encoding') from None
            if hashlib.sha256(raw).digest()!=hashlib.sha256(pkg['worker']).digest():
                raise Stop('uploaded Worker module bytes differ')
            module_status='returned control-plane module bytes match; delivered response bytes unverified'
        worker=self._worker()
        if worker['id']!=self._created_proof['workerId']:
            raise Stop('Worker identity changed after upload')
        script=self._call('GET','/workers/scripts/'+WORKER+'/script-settings',self._token)[1]
        self.plan.shared_settings(worker,script)
        result={'versionId':version,'sourceVersionId':SOURCE_VERSION,'inheritedBindings':28,
                'metadataRead':'matched reconciled binding/runtime/asset plan',
                'workerModule':module_status,'prewriteGuard':self._created_proof,
                'sharedSettings':'effective off unchanged at post-read',
                'delivery':'unverified','allocation':'checked separately by Publisher after this read'}
        self._verified_version=version
        return result
