"""Review-only publisher core; HTTP adapter lives in cloudflare_adapter.py.

All provider methods are injected; never treat a synthetic adapter as provider evidence.
"""
from __future__ import annotations
import hashlib, json, os, tempfile, zipfile
from pathlib import Path, PurePosixPath

ARCHIVE_SHA256 = 'a95c11fadb53761e36e0f3295fd048b870e98d6d2b3486b73dfe61cdc4909080'
CONFIG_SHA256 = '79653be90c48116e945c1fba0a961669d78f44462cc29b007f96f1fd46081e12'
WORKER_SHA256 = 'd63750041287fa412066ec4509b08bfa21dc7632dc61ae1458201a5023ee0b41'
ASSET_MANIFEST_SHA256 = '760148a79eef53666662bc7a48beeb82159a26940dff4ed69535dd3e3105028b'
ACCOUNT = 'f322585f9882be1f55d8cf6dc7e77ee1'
WORKER = 'daenem-staffportal-api-staging'

class Stop(Exception): pass
class Uncertain(Exception): pass
class Rejected(Exception): pass

def digest(data): return hashlib.sha256(data).hexdigest()

def load_package(path, pins=None):
    """Authenticate package, then check every manifest asset against its bytes.

    Provider hashes are SHA-256 truncated to 32 hex characters, permitted by the
    direct-upload API; they are NOT claimed to be Wrangler's historical hashes.
    pins is injectable for synthetic tests only.
    """
    pins = pins or dict(archive=ARCHIVE_SHA256, config=CONFIG_SHA256, worker=WORKER_SHA256, assets=ASSET_MANIFEST_SHA256, count=386)
    raw=Path(path).read_bytes()
    if digest(raw)!=pins['archive']: raise Stop('archive hash mismatch')
    import io
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=z.namelist()
        if len(names)!=len(set(names)): raise Stop('duplicate ZIP entry')
        def read(name):
            try: return z.read(name)
            except KeyError: raise Stop('missing package member') from None
        config_bytes=read('application/wrangler.json')
        worker=read('application/worker.mjs')
        asset_bytes=read('asset-manifest.json')
        if digest(config_bytes)!=pins['config'] or digest(worker)!=pins['worker'] or digest(asset_bytes)!=pins['assets']: raise Stop('package component hash mismatch')
        config=json.loads(config_bytes); document=json.loads(asset_bytes)
        if config.get('account_id')!=ACCOUNT or config.get('name')!=WORKER: raise Stop('wrong target in config')
        entries=document.get('files',[])
        if document.get('count')!=pins['count'] or len(entries)!=pins['count']: raise Stop('asset count mismatch')
        files={}; manifest={}
        for e in entries:
            path=e['path']; rel=PurePosixPath(path)
            if not path.startswith('/') or path.startswith('//') or '..' in rel.parts or path in files or '\\' in path: raise Stop('unsafe or duplicate asset path')
            content=read('application/client/'+path.lstrip('/'))
            if len(content)!=e['bytes'] or digest(content)!=e['sha256']: raise Stop('asset bytes mismatch')
            files[path]=content
            manifest[path]={'hash':digest(content)[:32], 'size':len(content)}
        return {'config':config,'worker':worker,'files':files,'manifest':manifest,
                'asset_sha256':{e['path']:e['sha256'] for e in entries}, 'archive':pins['archive'],
                'config_sha256':digest(config_bytes), 'asset_manifest_sha256':digest(asset_bytes)}

class Journal:
    """Write-ahead nonsecret evidence. Existing journal cannot be reset implicitly."""
    def __init__(self,path):
        self.path=Path(path)
        if self.path.exists():
            self.data=json.loads(self.path.read_text(encoding='utf-8'))
        else:
            self.data={'pending':None,'version_attempted':False,'version_id':None}
            self._save()
    def _save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        fd,tmp=tempfile.mkstemp(dir=self.path.parent,prefix='.journal-')
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                json.dump(self.data,f,sort_keys=True); f.flush(); os.fsync(f.fileno())
            os.replace(tmp,self.path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
    def begin(self,kind,identity):
        if self.data['pending'] is not None: raise Stop('prior write requires reconciliation')
        if kind=='version':
            if self.data['version_attempted']: raise Stop('version upload already attempted')
            self.data['version_attempted']=True
        self.data['pending']={'kind':kind,'identity':identity}; self._save()
    def finish(self,version_id=None):
        if self.data['pending'] is not None:
            completed=self.data.setdefault('completed_writes',[])
            if len(completed)>=4096: raise Stop('journal receipt bound reached')
            completed.append(dict(self.data['pending']))
        if version_id is not None: self.data['version_id']=version_id
        self.data['pending']=None; self._save()

    def transport_event(self,event):
        """Only fixed labels and bounded numeric codes; never provider text.

        Dispatch entry means the transport was entered, not that any bytes were
        delivered. An HTTP response is an observation, not proof of commit.
        """
        if not isinstance(event,dict) or set(event)-{'phase','operation','httpStatus','resultShape','providerErrorCodes'}:
            raise Stop('unsupported transport receipt')
        if event.get('phase') not in ('DISPATCH_ENTERED','RESPONSE_RECEIVED','TRANSPORT_EXCEPTION') or event.get('operation') not in ('asset-session','asset-bucket','worker-version'):
            raise Stop('unsupported transport receipt')
        if 'httpStatus' in event and (type(event['httpStatus']) is not int or not 100<=event['httpStatus']<=599):
            raise Stop('unsupported transport receipt')
        if 'resultShape' in event and event['resultShape'] not in ('ABSENT','NULL','OBJECT','OTHER','MALFORMED'):
            raise Stop('unsupported transport receipt')
        codes=event.get('providerErrorCodes',[])
        if not isinstance(codes,list) or len(codes)>16 or any(type(c) is not int or not 1000<=c<=999999 for c in codes):
            raise Stop('unsupported transport receipt')
        events=self.data.setdefault('transport_events',[])
        if len(events)>=4096: raise Stop('journal receipt bound reached')
        events.append(json.loads(json.dumps(event))); self._save()

class Publisher:
    def __init__(self,transport,journal,expected):
        self.t=transport; self.j=journal; self.expected=expected
        if len(expected.get('bindings',{}))!=31: raise Stop('need 31 independently pinned binding identities')
        if expected.get('account')!=ACCOUNT or expected.get('worker')!=WORKER: raise Stop('wrong target')
        if hasattr(self.t,'set_event_sink'): self.t.set_event_sink(self.j.transport_event)
    def _write(self,kind,identity,call):
        self.j.begin(kind,identity)
        try: result=call()
        except (Uncertain,TimeoutError):
            # Read-only reconciliation is mandatory. Missing/ambiguous evidence
            # never authorizes a new write; tokens may be returned only in memory.
            try: result=self.t.reconcile(kind,identity)
            except Exception: raise Stop('uncertain write; reconciliation unavailable') from None
            if not result or result.get('state')!='committed' or 'result' not in result:
                raise Stop('uncertain write; outcome not proven')
            result=result['result']
        except Rejected:
            # A rejection can still have partial effects; leave pending for review.
            raise Stop('provider rejected write; reconcile before proceeding') from None
        if not isinstance(result,dict): raise Stop('incomplete write response')
        return result
    def _upload(self,pkg):
        if self.j.data['pending'] is not None or self.j.data['version_attempted']: raise Stop('existing attempt requires independent reconciliation')
        if hasattr(self.t, 'preflight'): self.t.preflight(pkg)
        before=self.t.current()
        self._before=before
        if before != self.expected['current']: raise Stop('current target or allocation drift')
        session_id=digest(json.dumps(pkg['manifest'],sort_keys=True,separators=(',',':')).encode())
        session=self._write('session',session_id,lambda:self.t.start_assets(pkg['manifest']))
        if not isinstance(session.get('buckets'),list) or not session.get('jwt'): raise Stop('asset session incomplete')
        self.j.finish()
        buckets=session['buckets']; upload_jwt=session['jwt']; completion=None
        if not buckets: completion=upload_jwt
        # Provider buckets consist of hashes. Hash collisions with differing
        # bytes are rejected rather than choosing one arbitrarily.
        byhash={}
        for path,entry in pkg['manifest'].items():
            h=entry['hash']; b=pkg['files'][path]
            if h in byhash and byhash[h]!=b: raise Stop('provider hash collision')
            byhash[h]=b
        seen=set()
        for i,bucket in enumerate(buckets):
            if not isinstance(bucket,list) or not bucket or any(h not in byhash or h in seen for h in bucket): raise Stop('invalid upload bucket')
            seen.update(bucket)
            identity=digest(json.dumps([session_id,i,bucket],separators=(',',':')).encode())
            res=self._write('bucket',identity,lambda bucket=bucket:self.t.upload_bucket(upload_jwt,{h:byhash[h] for h in bucket}))
            if res.get('status') not in (200,201,202): raise Stop('asset upload not confirmed')
            if i < len(buckets)-1 and res.get('status') == 201:
                raise Stop('premature completion response')
            if i == len(buckets)-1:
                if res.get('status') != 201 or not res.get('jwt'):
                    raise Stop('documented completion response missing')
                completion=res['jwt']
            self.j.finish()
        if not completion: raise Stop('asset completion token missing')
        # Each transport is responsible for strict multipart encoding and secret handling.
        identity=digest((pkg['archive']+session_id).encode())
        res=self._write('version',identity,lambda:self.t.upload_version(pkg['worker'],pkg['config'],completion,identity))
        version=res.get('version_id')
        if not isinstance(version,str) or not version: raise Stop('version identity missing')
        self.j.finish(version)
        return version

    def run(self,pkg):
        if getattr(self.t,'supports_full_delivery_evidence',True) is False:
            raise Stop('full delivery evidence unsupported; use separately reviewed upload_only contract')
        version=self._upload(pkg)
        self.verify(version,pkg)
        return version

    def upload_only(self,pkg):
        """Supported upload-association evidence, never full delivery acceptance.

        Kept separate from run(), whose stronger verification is unchanged.
        A missing post-read remains unknown; it never causes a second upload.
        """
        from evidence import upload_evidence
        version=self._upload(pkg)
        evidence=upload_evidence(pkg,self.t,version)
        self.j.data['upload_association']=evidence
        self.j._save()
        if hasattr(self.t,'verify_upload'):
            evidence['versionMetadataVerification']=self.t.verify_upload(version,pkg)
            self.j.data['upload_association']=evidence
            self.j._save()
        after=self.t.current()
        if after!=self._before:
            raise Stop('deployment allocation drift after upload; do not activate')
        versions=after.get('versions')
        if not isinstance(versions,list) or any(v.get('version_id')==version for v in versions):
            raise Stop('candidate absence from deployment allocation not established')
        evidence['deploymentObservation']={'before':self._before,'after':after,'candidateAllocated':False,'scope':'point-in-time allocation only; version URL execution not excluded'}
        self.j.data['upload_association']=evidence
        self.j._save()
        return evidence
    def verify(self,version,pkg):
        actual=self.t.version_evidence(version)
        if not isinstance(actual,dict): raise Stop('version evidence unavailable')
        if actual.get('bindings')!=self.expected['bindings']: raise Stop('binding identity mismatch')
        if actual.get('settings')!=self.expected['settings']: raise Stop('runtime settings mismatch')
        if actual.get('worker_sha256')!=digest(pkg['worker']): raise Stop('worker identity mismatch')
        # Must be authoritative per-version path->sha256, not merely the
        # publisher's manifest, a completion token, or a partial URL crawl.
        if actual.get('asset_sha256')!=pkg['asset_sha256']: raise Stop('per-version asset identity not established')
        if actual.get('deployment')!=self.expected['current']['deployment'] or version in actual.get('traffic_versions',[]): raise Stop('version is not verified zero traffic')
