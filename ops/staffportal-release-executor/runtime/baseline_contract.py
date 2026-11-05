"""Pinned point-in-time settings; reject invented defaults or latest inheritance."""
import copy
import hashlib
import json
from pathlib import Path
from publisher import ACCOUNT, WORKER, Stop

BASELINE_SHA256 = 'e54462ae4e33d2e80a1eca23e65b297005946c768528de2fbca6b3e69d268046'
SOURCE_CAPTURE_SHA256 = 'ce0cd5ae224d93e27e385af07a887960f30dd370355f7433512c954047d207ec'
SOURCE_VERSION = '47927e3c-827a-4b7a-842c-8bdd6e88883e'
SOURCE_DEPLOYMENT = '678dde9e-e03f-49f1-9dd0-882b2a84c938'
DYNAMIC = {'SP_EFFECT_OPERATOR_SHA256', 'SP_EFFECT_OPERATOR_EXPIRES_AT'}

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()

def sha(value):
    return hashlib.sha256(value).hexdigest()

def load_baseline():
    raw = Path(__file__).with_name('baseline.json').read_bytes()
    if sha(raw) != BASELINE_SHA256:
        raise Stop('pinned baseline bytes changed')
    obj = json.loads(raw)
    if obj['sourceCaptureSha256'] != SOURCE_CAPTURE_SHA256:
        raise Stop('baseline source changed')
    return obj

def index_bindings(items):
    if not isinstance(items, list) or len(items) != 31:
        raise Stop('exactly 31 bindings required')
    result = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('name'), str) or not item['name'] or item['name'] in result:
            raise Stop('invalid or duplicate binding identity')
        result[item['name']] = item
    return result

class Baseline:
    def __init__(self):
        self._data = load_baseline()
        index_bindings(self._data['bindings'])

    def identity_sha256(self):
        return BASELINE_SHA256

    def projection(self):
        return copy.deepcopy(self._data)

    def release_gates(self):
        """No hosted reads here. These facts cannot be inferred from the capture."""
        return [
            'script-version API cannot pin secret inheritance to a source version; strict resolves latest',
            'EMAIL sender restrictions absent from preserved capture',
            'observability null in preserved capture; not an established disabled/default setting',
            'private operator-window values require separate reviewed pins',
            'capture is point-in-time, not proof of current state or a version-bound atomic snapshot',
            'version URL access is enabled in capture; zero deployment allocation does not prevent preview execution',
        ]

    def assert_publishable(self):
        # Do not start assets or upload an inevitably unverifiable version.
        raise Stop('preserved baseline incomplete for safe publication: ' + '; '.join(self.release_gates()))

    def validate_metadata(self, metadata, operator_value_sha256=None):
        """Validate all available pins. Success is comparison, not publish approval.

        Never silently accept an inherit placeholder in place of a pinned value.
        No plaintext value is retained in the object or emitted by failures.
        """
        if not isinstance(metadata, dict) or metadata.get('main_module') != 'worker.mjs':
            raise Stop('wrong main module')
        allowed = {'main_module', 'bindings', 'assets'} | set(self._data['settings'])
        if set(metadata) - allowed:
            raise Stop('unreviewed version metadata field')
        expected = index_bindings(self._data['bindings'])
        actual = index_bindings(metadata.get('bindings'))
        if set(expected) != set(actual):
            raise Stop('binding names differ from pinned baseline')
        for name, want in expected.items():
            got = actual[name]
            if got.get('type') == 'inherit':
                raise Stop('script-version inheritance is latest, not source-version pinned')
            if got.get('type') != want['type']:
                raise Stop('binding type differs from pinned baseline')
            if want['type'] == 'secret_text':
                raise Stop('secret plaintext must not be supplied; pinned inheritance requires Workers API')
            if want['type'] == 'plain_text':
                if set(got) != {'name', 'type', 'text'} or not isinstance(got['text'], str):
                    raise Stop('plain-text binding schema mismatch')
                pin = (operator_value_sha256 or {}).get(name) if name in DYNAMIC else want.get('valueSha256')
                if not pin or sha(got['text'].encode()) != pin:
                    raise Stop('plain-text binding value differs from reviewed pin')
            else:
                # Exact comparison also rejects extra sender, jurisdiction or other fields.
                if got != want:
                    raise Stop('binding resource differs from pinned baseline')
        for name, want in self._data['settings'].items():
            if want is None:
                raise Stop('unknown setting cannot be replaced with a default')
            if name not in metadata or canonical(metadata[name]) != canonical(want):
                raise Stop('runtime setting differs from pinned baseline')
        assets = metadata.get('assets')
        if not isinstance(assets, dict) or set(assets) != {'config'} or assets['config'] != {'run_worker_first': True, 'not_found_handling': 'single-page-application'}:
            raise Stop('asset routing requires separately approved worker-first metadata')

    def project_read(self, settings, access):
        """Normalize documented raw settings without retaining plaintext values."""
        if not isinstance(settings, dict) or not isinstance(access, dict):
            raise Stop('invalid read snapshot')
        projected = []
        expected = index_bindings(self._data['bindings'])
        raw = index_bindings(settings.get('bindings'))
        if set(raw) != set(expected):
            raise Stop('read binding names differ')
        for name, value in raw.items():
            kind = value.get('type')
            item = copy.deepcopy(value)
            if kind == 'plain_text':
                if set(item) != {'name', 'type', 'text'} or not isinstance(item['text'], str):
                    raise Stop('unrecognized variable response')
                item['valueSha256'] = sha(item.pop('text').encode())
            elif kind == 'secret_text':
                if set(item) != {'name', 'type'}:
                    raise Stop('unexpected secret response fields')
            elif kind == 'd1':
                identity = item.get('id', item.get('database_id'))
                if not isinstance(identity, str) or any(item.get(k, identity) != identity for k in ('id', 'database_id')):
                    raise Stop('database binding aliases disagree')
                item['id'] = item['database_id'] = identity
            projected.append(item)
        runtime = {}
        for name in self._data['settings']:
            if name not in settings:
                raise Stop('required captured setting missing from read')
            runtime[name] = copy.deepcopy(settings[name])
        if any(k not in access for k in ('enabled', 'previews_enabled')):
            raise Stop('version URL routing state missing')
        return {'account': ACCOUNT, 'worker': WORKER,
                'bindings': sorted(projected, key=lambda b: b['name']),
                'settings': runtime,
                'access': {k: access[k] for k in ('enabled', 'previews_enabled')}}

    def compare_snapshot(self, snapshot, operator_value_sha256=None):
        """Read-only comparison of a captured shape, never authorization to write.

        Captured bindings are already sanitized projections. Compare every field,
        not a name/type count. Unknown settings remain unknown after comparison.
        """
        if snapshot.get('account') != ACCOUNT or snapshot.get('worker') != WORKER:
            raise Stop('snapshot target mismatch')
        a = index_bindings(snapshot.get('bindings'))
        b = index_bindings(self._data['bindings'])
        if set(a) != set(b):
            raise Stop('snapshot binding names differ')
        for name, want in b.items():
            got = copy.deepcopy(a[name])
            if name in DYNAMIC:
                pin = (operator_value_sha256 or {}).get(name)
                if not pin or got.pop('valueSha256', None) != pin:
                    raise Stop('operator-window binding not independently pinned')
            if got != want:
                raise Stop('snapshot binding identity or value drift')
        for field in ('settings', 'access'):
            if canonical(snapshot.get(field)) != canonical(self._data[field]):
                raise Stop('snapshot settings or access drift')
        return {'comparison': 'matches captured projection', 'publicationReady': False,
                'baselineSha256': BASELINE_SHA256, 'openGates': self.release_gates()}


def publisher_expectations():
    """Original capture expectations. Drift must stop, not repin automatically."""
    b = load_baseline()
    return {'account': ACCOUNT, 'worker': WORKER,
            'bindings': {x['name']: x for x in b['bindings']},
            'settings': b['settings'],
            'current': {'deployment': SOURCE_DEPLOYMENT, 'target': WORKER,
                        'versions': [{'version_id': SOURCE_VERSION, 'percentage': 100}]}}
