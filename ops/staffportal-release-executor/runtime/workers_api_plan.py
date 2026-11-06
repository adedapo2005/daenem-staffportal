"""Version-pinned plan and private prepared-window inputs. No network or RNG."""
import copy
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from baseline_contract import canonical, index_bindings, DYNAMIC, SOURCE_VERSION, SOURCE_DEPLOYMENT
from publisher import ACCOUNT, WORKER, Stop, ARCHIVE_SHA256, CONFIG_SHA256, WORKER_SHA256, ASSET_MANIFEST_SHA256

PIN = '70c90399a4125a274e151f8917dbb21ca241552a8502d68f9e5445ed7b853d9b'
WINDOW_MANIFEST = 'c15e06e6e62ddcda71d2009b7d6ab97ebb6e9d724bee4fe3e2b640e5ea334cc4'
PREPARE_SCRIPT = '391e463f9d54d465df2e92b426c7bc78978943085f2f91c75be1b12641143bd5'
PLAN_HASH = '39b10b4fc21e061f6ed7d989351e51d1e558ad6ff4c8fc0364ba90e4165be950'
DATABASE = '87b3e0dd-76c9-4a29-8185-a5abc34c02f6'
HEX = re.compile(r'[0-9a-f]{64}\Z')
VERSION_SETTINGS = ('compatibility_date', 'compatibility_flags', 'limits', 'cache_options')

def sha(raw): return hashlib.sha256(raw).hexdigest()
def utcnow(): return dt.datetime.now(dt.timezone.utc)
def instant(value):
    try:
        v = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if v.tzinfo is None or v.utcoffset() != dt.timedelta(0): raise ValueError()
        return v
    except (ValueError, AttributeError, TypeError):
        raise Stop('invalid explicit UTC window time') from None

class PreparedWindow:
    """In-memory non-capability values; never decrypt operator-capability.dpapi.

    Use load() for real inputs. Direct construction is used for synthetic tests.
    The approved caller pins window.json bytes after window preparation; this
    adapter neither chooses a new window nor creates/changes a credential.
    """
    def __init__(self, values, start, end, expires, record_sha256, config_sha256):
        if not isinstance(values,dict) or set(values) != DYNAMIC or not isinstance(values.get('SP_EFFECT_OPERATOR_SHA256'),str) or not HEX.fullmatch(values['SP_EFFECT_OPERATOR_SHA256']):
            raise Stop('prepared operator values incomplete')
        if not isinstance(record_sha256,str) or not HEX.fullmatch(record_sha256) or not isinstance(config_sha256,str) or not HEX.fullmatch(config_sha256):
            raise Stop('prepared window pins missing')
        self._values = copy.deepcopy(values)
        self.start, self.end, self.expires = map(instant, (start,end,expires))
        if self.end != self.start+dt.timedelta(minutes=60) or self.expires != self.start+dt.timedelta(minutes=90):
            raise Stop('prepared window duration differs from reviewed contract')
        if instant(values['SP_EFFECT_OPERATOR_EXPIRES_AT']) != self.expires:
            raise Stop('operator expiry differs from window record')
        self.record_sha256, self.config_sha256 = record_sha256, config_sha256

    @classmethod
    def load(cls, directory, approved_window_sha256):
        root=Path(directory)
        if not (root/'operator-capability.dpapi').is_file():
            raise Stop('prepared capability custody artifact missing; no decryption attempted')
        raw=(root/'window.json').read_bytes()
        if not isinstance(approved_window_sha256,str) or sha(raw)!=approved_window_sha256:
            raise Stop('prepared window record hash mismatch')
        w=json.loads(raw.decode('utf-8-sig'))
        if w.get('target')!=WORKER or w.get('database')!=DATABASE or w.get('planHash')!=PLAN_HASH or w.get('epoch')!='staffportal-inplace-local-v1' or w.get('packageManifestSha256')!=WINDOW_MANIFEST:
            raise Stop('prepared window target or package contract mismatch')
        package=Path(w['package'])
        manifest_bytes=(package/'release-manifest.json').read_bytes()
        if sha(manifest_bytes)!=WINDOW_MANIFEST or sha((package/'tools/prepare-window.ps1').read_bytes())!=PREPARE_SCRIPT:
            raise Stop('operator package provenance changed')
        manifest=json.loads(manifest_bytes.decode('utf-8-sig'))
        # Verify the same finite inputs as the approved preparation script.
        for name,pin in manifest['files'].items():
            rel=Path(name)
            if rel.is_absolute() or '..' in rel.parts or ':' in name:
                raise Stop('unsafe operator package member')
            if sha((package/rel).read_bytes())!=pin:
                raise Stop('operator package input hash mismatch')
        cfg_raw=(root/'wrangler.migration.json').read_bytes()
        if sha(cfg_raw)!=w.get('migrationConfigSha256'):
            raise Stop('prepared window config changed')
        cfg=json.loads(cfg_raw.decode('utf-8-sig'))
        if cfg.get('account_id')!=ACCOUNT or cfg.get('name')!=WORKER:
            raise Stop('prepared window config targets another Worker')
        variables=cfg.get('vars',{})
        values={name:variables.get(name) for name in DYNAMIC}
        return cls(values,w['startUtc'],w['targetEndUtc'],w['capabilityExpiryUtc'],approved_window_sha256,sha(cfg_raw))

    def check(self, clock=utcnow):
        now=clock()
        if not isinstance(now,dt.datetime) or now.tzinfo is None:
            raise Stop('window clock must be timezone-aware')
        if not self.start<=now<self.end or now>=self.expires:
            raise Stop('approved prepared window is not currently open')

    def values(self): return copy.deepcopy(self._values)
    def value_pins(self): return {k:sha(v.encode()) for k,v in self._values.items()}

class WorkersAPIPlan:
    def __init__(self, window, clock=utcnow):
        raw=Path(__file__).with_name('reconciled-baseline.json').read_bytes()
        if sha(raw)!=PIN: raise Stop('reconciled baseline changed')
        self._data=json.loads(raw)
        index_bindings(self._data['bindings'])
        if self._data['sourceVersion']!=SOURCE_VERSION or self._data['sourceDeployment']!=SOURCE_DEPLOYMENT:
            raise Stop('source version or deployment pin changed')
        self.window, self.clock = window, clock
        self._proof=None
        self._ai_project_pin=None

    def identity_sha256(self): return PIN
    def projection(self): return copy.deepcopy(self._data)
    def assert_publishable(self):
        self.window.check(self.clock)
        if self._proof is None: raise Stop('current execution drift checks required')
    def invalidate(self): self._proof=None

    def version_metadata(self):
        # ASSETS must bind the new manifest; operator values come from this window.
        values=self.window.values(); bindings=[]
        for b in self._data['bindings']:
            name=b['name']
            if name=='ASSETS': bindings.append({'name':name,'type':'assets'})
            elif name in DYNAMIC: bindings.append({'name':name,'type':'plain_text','text':values[name]})
            else: bindings.append({'name':name,'type':'inherit','version_id':SOURCE_VERSION})
        meta={'main_module':'worker.mjs','bindings':bindings,'assets':{'config':copy.deepcopy(self._data['assetConfig'])}}
        for key in VERSION_SETTINGS: meta[key]=copy.deepcopy(self._data['settings'][key])
        # Empty placement is the approved default; omit the override from the
        # API's nonempty placement union and verify default placement on reads.
        return meta

    def validate_metadata(self, metadata):
        want=self.version_metadata()
        if canonical(metadata)!=canonical(want):
            raise Stop('version metadata differs from exact version-pinned plan')
        bindings=index_bindings(metadata['bindings'])
        if len([b for b in bindings.values() if b['type']=='inherit'])!=28:
            raise Stop('all inherited binding source versions must be explicit')

    def validate_package(self, pkg):
        if pkg.get('archive')!=ARCHIVE_SHA256 or pkg.get('config_sha256')!=CONFIG_SHA256 or sha(pkg['worker'])!=WORKER_SHA256 or len(pkg.get('files',{}))!=386:
            raise Stop('unchanged approved application package required')
        if pkg['config'].get('name')!=WORKER or pkg['config'].get('account_id')!=ACCOUNT:
            raise Stop('application target mismatch')
        original=Path(__file__).with_name('asset-manifest-normalized.json').read_bytes()
        if sha(original)!='39ef9da6b5335308c76ce9d23e0d72f5cb712c941fa75fa3164e2c8eb2c53b37' or pkg.get('asset_manifest_sha256')!=ASSET_MANIFEST_SHA256:
            raise Stop('approved asset-manifest pins changed')
        entries=json.loads(original)['files']
        if {x['path']:x['sha256'] for x in entries}!=pkg.get('asset_sha256'):
            raise Stop('approved asset collection changed')
        if set(pkg.get('manifest',{}))!=set(pkg['files']):
            raise Stop('asset collection incomplete')
        for entry in entries:
            path=entry['path']; raw=pkg['files'][path]
            if not isinstance(raw,bytes) or len(raw)!=entry['bytes'] or sha(raw)!=entry['sha256'] or pkg['manifest'][path]!={'hash':entry['sha256'][:32],'size':entry['bytes']}:
                raise Stop('approved asset bytes changed')


    def binding_projection(self, raw, *, target=False):
        a=index_bindings(raw); expected=index_bindings(self._data['bindings'])
        if set(a)!=set(expected): raise Stop('31-binding name set differs')
        out=[]
        for name,want in expected.items():
            item=copy.deepcopy(a[name]); kind=item.get('type')
            read_project_pin=None
            if kind=='inherit':
                # The source GET must resolve actual definitions. A target GET
                # may retain the exact documented reference; validate its origin.
                if not target or name in DYNAMIC or name=='ASSETS' or item!={'name':name,'type':'inherit','version_id':SOURCE_VERSION}:
                    raise Stop('wrong or unresolved source inheritance')
                out.append(copy.deepcopy(want)); continue
            if kind!=want['type']: raise Stop('binding type drift')
            if kind=='plain_text':
                if set(item)!={'name','type','text'} or not isinstance(item['text'],str):
                    raise Stop('plain-text definition unavailable')
                value_sha=sha(item.pop('text').encode())
                if name in DYNAMIC:
                    if target and value_sha!=self.window.value_pins()[name]:
                        raise Stop('target operator value differs from prepared window')
                    item['valueSha256']=value_sha
                    out.append(item);continue
                item['valueSha256']=value_sha
            elif kind=='d1':
                identity=item.get('id',item.get('database_id'))
                if not isinstance(identity,str) or any(item.get(k,identity)!=identity for k in ('id','database_id')):
                    raise Stop('database binding aliases disagree')
                item['id']=item['database_id']=identity
            elif kind=='ai' and 'project' in item:
                # The version/settings reads return opaque project metadata
                # beyond the name/type write schema. Preserve its equality
                # across every source/current/target observation; version
                # creation still inherits AI from the exact source version.
                project=item.pop('project')
                if not isinstance(project,str):raise Stop('AI project read metadata malformed')
                read_project_pin=sha(canonical(project))
                if self._ai_project_pin is not None and self._ai_project_pin!=read_project_pin:
                    raise Stop('AI project read metadata changed during execution')
                self._ai_project_pin=read_project_pin
            if item!=want: raise Stop('binding resource, restriction or value drift')
            if read_project_pin is not None:item['readProjectSha256']=read_project_pin
            out.append(item)
        return sorted(out,key=lambda b:b['name'])

    def version_settings(self, source, *, version_read=False):
        got={}
        for key in VERSION_SETTINGS:
            # The version endpoint omits the empty flag list. Accept that
            # representation only for version reads when [] is pinned; the
            # current settings endpoint must still return its explicit [].
            if key=='compatibility_flags' and key not in source and version_read and self._data['settings'][key]==[]:
                got[key]=[];continue
            if key not in source or canonical(source[key])!=canonical(self._data['settings'][key]):
                raise Stop('version runtime setting drift or missing value')
            got[key]=source[key]
        placement=source.get('placement',{})
        if placement!={}: raise Stop('default placement drift')
        return copy.deepcopy(got)

    def shared_settings(self, worker, script):
        # Explicit false and the historical null representation are equivalent
        # ONLY under the verified activation packet's effective-off decision.
        for obj in (worker,script):
            if 'observability' not in obj or obj.get('logpush') is not False:
                raise Stop('shared logging setting unavailable or enabled')
            obs=obj['observability']
            if obs is not None:
                if not isinstance(obs,dict) or obs.get('enabled') is not False:
                    raise Stop('observability is not effective off')
                for key in ('logs','traces','issues'):
                    child=obs.get(key,{})
                    if child is not None and (not isinstance(child,dict) or child.get('enabled') is True):
                        raise Stop('unexpected enabled observability subsystem')
            # No tail consumer is approved. null/[] equivalence is in the packet.
        if worker.get('tail_consumers')!=[]:
            raise Stop('tail consumer drift')
        return {'observability':{'enabled':False},'logpush':False,'tail_consumers':[],
                'representations':{'worker': 'null' if worker['observability'] is None else 'explicit-off',
                                   'script': 'null' if script['observability'] is None else 'explicit-off'}}

    def expected_current(self):
        return {'deployment':SOURCE_DEPLOYMENT,'target':WORKER,
                'versions':[{'version_id':SOURCE_VERSION,'percentage':100}]}

    def publisher_expectations(self):
        return {'account':ACCOUNT,'worker':WORKER,'bindings':index_bindings(self._data['bindings']),
                'settings':copy.deepcopy(self._data['settings']),'current':self.expected_current()}
