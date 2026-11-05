"""Direct-upload HTTP adapter. No deployment, settings mutation or auto-retry.

Default baseline blocks publication until its concrete unresolved pins are closed.
Tests replace the HTTP sender and baseline with explicit synthetic fixtures.
"""
import base64
import hashlib
import http.client
import json
import mimetypes
import re
import secrets
import urllib.error
import urllib.request
from publisher import ACCOUNT, WORKER, Rejected, Stop, Uncertain
from baseline_contract import Baseline, canonical, BASELINE_SHA256

API = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT
MAX_RESPONSE = 4 * 1024 * 1024
VERSION = re.compile(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z')
HASH = re.compile(r'[0-9a-f]{32}\Z')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def http_send(method, url, headers, body):
    """One request, fixed origin, redirects/proxies disabled, bounded response.

    No exception includes provider bodies, headers, credentials or URLs.
    HTTPError is closed even when reading its body fails.
    """
    if not url.startswith(API + '/workers/') or method not in ('GET', 'POST'):
        raise Stop('unexpected HTTP operation')
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
    try:
        try:
            response = opener.open(req, timeout=45)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise Uncertain('provider response exceeds supported bound')
            return response.code, {}, raw
    except (TimeoutError, urllib.error.URLError, OSError, http.client.HTTPException):
        raise Uncertain('HTTP outcome unknown') from None

def multipart(parts):
    boundary = 'sp-' + secrets.token_hex(24)
    body = []
    for name, ctype, data, filename in parts:
        if not isinstance(name, str) or not isinstance(ctype, str) or not isinstance(data, bytes):
            raise Stop('invalid multipart field')
        if any(c in name for c in '\r\n"') or any(c in ctype for c in '\r\n'):
            raise Stop('invalid multipart field')
        if filename is not None and (not isinstance(filename, str) or any(c in filename for c in '\r\n"')):
            raise Stop('invalid multipart filename')
        disp = 'Content-Disposition: form-data; name="' + name + '"'
        if filename:
            disp += '; filename="' + filename + '"'
        body.extend([('--' + boundary + '\r\n' + disp + '\r\nContent-Type: ' + ctype + '\r\n\r\n').encode(), data, b'\r\n'])
    body.append(('--' + boundary + '--\r\n').encode())
    return 'multipart/form-data; boundary=' + boundary, b''.join(body)

class CloudflareAdapter:
    supports_full_delivery_evidence = False
    def __init__(self, api_token, metadata, send=http_send, *, baseline=None):
        if not isinstance(api_token, str) or not api_token or any(c in api_token for c in '\r\n'):
            raise Stop('missing or malformed Cloudflare token')
        self._baseline = baseline if baseline is not None else Baseline()
        if metadata is not None:
            self._baseline.validate_metadata(metadata)
        self._metadata = json.loads(json.dumps(metadata))
        self._token = api_token
        self._send = send
        self._state = 'new'
        self._completion = None
        self._manifest = None
        self._evidence = None
        self._progress = []
        self._before = None
        self._index = 0
        self._types = {}
        self._sizes = {}
        self._event_sink = None

    def set_event_sink(self, sink):
        if self._event_sink is not None or self._state!='new' or not callable(sink):
            raise Stop('transport receipt sink cannot be replaced')
        self._event_sink=sink

    def _event(self, operation, phase, **fields):
        if operation is not None and self._event_sink is not None:
            self._event_sink({'operation':operation,'phase':phase,**fields})

    def _call(self, method, path, token, body=None, ctype=None, *, statuses=(200,), allow_missing_result=False):
        operation=None
        if method=='POST':
            if path=='/workers/scripts/'+WORKER+'/assets-upload-session': operation='asset-session'
            elif path=='/workers/assets/upload?base64=true': operation='asset-bucket'
            elif path in ('/workers/scripts/'+WORKER+'/versions?bindings_inherit=strict',
                          '/workers/workers/'+WORKER+'/versions?deploy=false'): operation='worker-version'
            else: raise Stop('unrecognized write operation')
        if allow_missing_result and (operation!='asset-bucket' or statuses not in ((200,201),(200,201,202))):
            raise Stop('optional result outside intermediate asset response')
        headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}
        if ctype:
            headers['Content-Type'] = ctype
        # The first receipt must be durable before entering the sender. Receipt
        # failure stops here; failure after dispatch leaves the journal pending.
        self._event(operation,'DISPATCH_ENTERED')
        try:
            status, _, raw = self._send(method, API + path, headers, body)
        except Exception:
            # Injected transports must not leak credential-bearing exceptions.
            self._event(operation,'TRANSPORT_EXCEPTION')
            raise Uncertain('HTTP outcome unknown') from None
        obj=None
        if isinstance(raw,bytes) and len(raw)<=MAX_RESPONSE:
            try: obj=json.loads(raw)
            except (ValueError,UnicodeDecodeError): pass
        shape=('MALFORMED' if not isinstance(obj,dict) else 'ABSENT' if 'result' not in obj
               else 'NULL' if obj['result'] is None else 'OBJECT' if isinstance(obj['result'],dict) else 'OTHER')
        codes=[]
        if isinstance(obj,dict) and isinstance(obj.get('errors'),list):
            codes=sorted({e['code'] for e in obj['errors'] if isinstance(e,dict)
                          and type(e.get('code')) is int and 1000<=e['code']<=999999})[:16]
        fields={'resultShape':shape,'providerErrorCodes':codes}
        if type(status) is int and 100<=status<=599: fields['httpStatus']=status
        self._event(operation,'RESPONSE_RECEIVED',**fields)
        if type(status) is not int or not isinstance(raw, bytes) or len(raw) > MAX_RESPONSE:
            raise Uncertain('unsupported provider response')
        if status in (408, 409, 425, 429) or status >= 500:
            raise Uncertain('provider response does not establish write outcome')
        if not 200 <= status < 300:
            raise Rejected('provider rejected request (HTTP ' + str(status) + ')')
        if status not in statuses:
            raise Uncertain('unexpected successful HTTP status')
        if obj is None:
            raise Uncertain('malformed provider response')
        if not isinstance(obj, dict) or obj.get('success') is not True or obj.get('errors') not in (None, []):
            raise Uncertain('provider response incomplete')
        # The asset API documents result as optional. Only a non-final HTTP 200/202
        # bucket response may omit it. Null/wrong types and completion without
        # HTTP 201 plus a token still hold; session/version/GET remain strict.
        if allow_missing_result and status in (200,202) and 'result' not in obj:
            return status,{}
        if not isinstance(obj.get('result'),dict):
            raise Uncertain('provider response incomplete')
        return status, obj['result']

    def preflight(self, pkg):
        self._baseline.assert_publishable()
        if self._metadata is None:
            raise Stop('read-only adapter has no version metadata')

    def start_assets(self, manifest):
        if self._state != 'new':
            raise Stop('existing asset attempt cannot be restarted')
        self._baseline.assert_publishable()
        if self._metadata is None:
            raise Stop('read-only adapter has no version metadata')
        if not isinstance(manifest, dict):
            raise Stop('invalid asset manifest')
        for path, entry in manifest.items():
            if not isinstance(path, str) or not path.startswith('/') or any(c in path for c in '\r\n') or not isinstance(entry, dict) or set(entry) != {'hash', 'size'}:
                raise Stop('invalid asset manifest')
            h = entry['hash']
            if not isinstance(h, str) or not HASH.fullmatch(h) or type(entry['size']) is not int or entry['size'] < 0:
                raise Stop('invalid asset manifest entry')
            kind = mimetypes.guess_type(path)[0] or 'application/octet-stream'
            if h in self._types and (self._types[h] != kind or self._sizes[h] != entry['size']):
                raise Stop('same asset hash has conflicting identity or media type')
            self._types[h], self._sizes[h] = kind, entry['size']
        self._state = 'session-pending'
        body = json.dumps({'manifest': manifest}, separators=(',', ':')).encode()
        status, result = self._call('POST', '/workers/scripts/' + WORKER + '/assets-upload-session', self._token, body, 'application/json', statuses=(200, 201))
        buckets, token = result.get('buckets'), result.get('jwt')
        if not isinstance(buckets, list) or not isinstance(token, str) or not token or any(c in token for c in '\r\n'):
            raise Uncertain('session response incomplete')
        seen = set()
        for bucket in buckets:
            if not isinstance(bucket, list) or not bucket:
                raise Uncertain('invalid provider bucket plan')
            for h in bucket:
                if not isinstance(h, str) or h not in self._types or h in seen:
                    raise Uncertain('invalid or repeated provider hash')
                seen.add(h)
        self._manifest = json.loads(json.dumps(manifest))
        self._buckets = json.loads(json.dumps(buckets))
        self._session_token_hash = hashlib.sha256(token.encode()).hexdigest()
        self._progress = [{'stage': 'session', 'httpStatus': status, 'bucketCount': len(buckets)}]
        if not buckets:
            self._completion = hashlib.sha256(token.encode()).hexdigest()
            self._state = 'complete'
        else:
            self._state = 'bucket-ready'
        return {'buckets': buckets, 'jwt': token}

    def upload_bucket(self, jwt, files):
        if self._state != 'bucket-ready' or not isinstance(jwt, str) or hashlib.sha256(jwt.encode()).hexdigest() != self._session_token_hash:
            raise Stop('asset upload session mismatch or prior uncertain write')
        if not isinstance(files, dict) or set(files) != set(self._buckets[self._index]):
            raise Stop('bucket differs from provider plan')
        parts = []
        for h, data in files.items():
            if not isinstance(data, bytes) or len(data) != self._sizes[h] or hashlib.sha256(data).hexdigest()[:32] != h:
                raise Stop('bucket bytes differ from manifest')
            parts.append((h, self._types[h], base64.b64encode(data), h))
        ctype, body = multipart(parts)
        self._state = 'bucket-pending'
        final = self._index == len(self._buckets) - 1
        status, result = self._call('POST', '/workers/assets/upload?base64=true', jwt, body, ctype, statuses=(200, 201, 202),allow_missing_result=not final)
        token = result.get('jwt')
        if (not final and status not in (200,202)) or (final and (status != 201 or not isinstance(token, str) or not token or any(c in token for c in '\r\n'))):
            raise Uncertain('documented final completion response not established')
        self._progress.append({'stage': 'bucket', 'index': self._index, 'httpStatus': status, 'hashes': list(files)})
        self._index += 1
        if final:
            self._completion = hashlib.sha256(token.encode()).hexdigest()
            self._state = 'complete'
        else:
            self._state = 'bucket-ready'
        return {'status': status, **({'jwt': token} if final else {})}

    def upload_version(self, worker, config, jwt, identity):
        if config.get('account_id') != ACCOUNT or config.get('name') != WORKER:
            raise Stop('wrong target')
        if not isinstance(identity, str) or not re.fullmatch('[0-9a-f]{64}', identity):
            raise Stop('invalid upload association identity')
        if self._state != 'complete' or not isinstance(jwt, str) or hashlib.sha256(jwt.encode()).hexdigest() != self._completion:
            raise Stop('completion response not established or version already attempted')
        # A library caller cannot bypass unresolved baseline gates via direct invocation.
        self._baseline.assert_publishable()
        meta = json.loads(json.dumps(self._metadata))
        meta['assets']['jwt'] = jwt
        meta['annotations'] = {'workers/message': 'staffportal-review-' + identity}
        ctype, body = multipart([('metadata', 'application/json', json.dumps(meta, separators=(',', ':')).encode(), None), ('worker.mjs', 'application/javascript+module', worker, 'worker.mjs')])
        self._state = 'version-pending'
        status, result = self._call('POST', '/workers/scripts/' + WORKER + '/versions?bindings_inherit=strict', self._token, body, ctype, statuses=(200, 201))
        version = result.get('id')
        if not isinstance(version, str) or not VERSION.fullmatch(version):
            raise Uncertain('version response missing supported identity')
        self._state = 'version-returned'
        self._evidence = {'version_id': version, 'manifest': self._manifest,
                          'completion': {'mode': 'session-empty' if not self._buckets else 'final-bucket-201', 'responses': self._progress},
                          'association': {'requestIdentity': identity, 'workerSha256': hashlib.sha256(worker).hexdigest(), 'metadataWithoutTokenSha256': hashlib.sha256(canonical(self._metadata)).hexdigest(), 'versionResponseHttpStatus': status, 'completionTokenSubmitted': True},
                          'baselineSha256': self._baseline.identity_sha256(),
                          'delivered_bytes': 'unverified'}
        return {'version_id': version}

    def upload_evidence(self):
        if self._evidence is None:
            raise Stop('successful version response not available')
        return json.loads(json.dumps(self._evidence))

    def reconcile(self, kind, identity):
        # No documented operation lookup/idempotency contract was established.
        # Matching annotations or absent list entries do not prove a lost outcome.
        return None

    def compare_current_baseline(self, operator_value_sha256):
        """Read-only, sanitized comparison. Not an atomic version-bound capture."""
        settings = self._call('GET', '/workers/scripts/' + WORKER + '/settings', self._token)[1]
        access = self._call('GET', '/workers/scripts/' + WORKER + '/subdomain', self._token)[1]
        projection = self._baseline.project_read(settings, access)
        return self._baseline.compare_snapshot(projection, operator_value_sha256)

    def read_version(self, version):
        if not isinstance(version, str) or not VERSION.fullmatch(version):
            raise Stop('invalid version identifier')
        result = self._call('GET', '/workers/scripts/' + WORKER + '/versions/' + version, self._token)[1]
        if result.get('id') != version:
            raise Stop('version read returned another identity')
        return result

    def current(self):
        result = self._call('GET', '/workers/scripts/' + WORKER + '/deployments', self._token)[1]
        deployments = result.get('deployments')
        if not isinstance(deployments, list) or not deployments or not isinstance(deployments[0], dict):
            raise Stop('current deployment unavailable')
        current = deployments[0]
        if not isinstance(current.get('id'), str) or not VERSION.fullmatch(current['id']) or not isinstance(current.get('versions'), list) or not current['versions']:
            raise Stop('current deployment identity/allocation unavailable')
        versions = []
        for v in current['versions']:
            if not isinstance(v, dict) or not isinstance(v.get('version_id'), str) or not VERSION.fullmatch(v['version_id']) or type(v.get('percentage')) not in (int, float) or not 0 <= v['percentage'] <= 100:
                raise Stop('current allocation malformed')
            versions.append({'version_id': v['version_id'], 'percentage': v['percentage']})
        if len({v['version_id'] for v in versions}) != len(versions) or sum(v['percentage'] for v in versions) != 100:
            raise Stop('current allocation incomplete')
        return {'deployment': current['id'], 'target': WORKER, 'versions': sorted(versions, key=lambda v: v['version_id'])}

    def version_evidence(self, version):
        self.read_version(version)
        raise Stop('full delivered-byte evidence is not provided by version metadata GET')
