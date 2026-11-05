"""Token-free association evidence. This is not a provider-signed receipt."""
import copy
import re
from publisher import Stop, digest

HEX64 = re.compile(r'[0-9a-f]{64}\Z')

def upload_evidence(pkg, adapter, version):
    e = adapter.upload_evidence()
    if e.get('version_id') != version or e.get('manifest') != pkg['manifest']:
        raise Stop('upload evidence does not match request and version')
    if set(pkg['asset_sha256']) != set(pkg['manifest']) or set(pkg['files']) != set(pkg['manifest']):
        raise Stop('incomplete asset manifest')
    for path, content in pkg['files'].items():
        h = digest(content)
        if pkg['asset_sha256'][path] != h or pkg['manifest'][path] != {'hash': h[:32], 'size': len(content)}:
            raise Stop('asset evidence does not match package bytes')
    association = e.get('association')
    completion = e.get('completion')
    association_fields = {'workerSha256', 'requestIdentity', 'metadataWithoutTokenSha256', 'versionResponseHttpStatus', 'completionTokenSubmitted'}
    if not isinstance(association, dict) or set(association) != association_fields or association.get('workerSha256') != digest(pkg['worker']) or association.get('completionTokenSubmitted') is not True:
        raise Stop('version submission association incomplete')
    for key in ('workerSha256', 'requestIdentity', 'metadataWithoutTokenSha256'):
        if not isinstance(association[key], str) or not HEX64.fullmatch(association[key]):
            raise Stop('submission hash missing')
    if type(association['versionResponseHttpStatus']) is not int or association['versionResponseHttpStatus'] not in (200, 201):
        raise Stop('version response not confirmed')
    if not isinstance(e.get('baselineSha256'), str) or not HEX64.fullmatch(e['baselineSha256']):
        raise Stop('baseline identity missing')
    if not isinstance(completion, dict) or set(completion) != {'mode','responses'} or completion.get('mode') not in ('session-empty', 'final-bucket-201'):
        raise Stop('completion evidence missing')
    rows = completion['responses']
    if not isinstance(rows,list) or not rows or set(rows[0]) != {'stage','httpStatus','bucketCount'} or rows[0]['stage'] != 'session' or type(rows[0]['bucketCount']) is not int:
        raise Stop('session evidence incomplete')
    count = rows[0]['bucketCount']
    if count < 0 or len(rows) != count+1 or type(rows[0]['httpStatus']) is not int or rows[0]['httpStatus'] not in (200,201):
        raise Stop('session evidence inconsistent')
    if (completion['mode']=='session-empty') != (count==0):
        raise Stop('completion mode inconsistent')
    seen=set();known={v['hash'] for v in pkg['manifest'].values()}
    for i,row in enumerate(rows[1:]):
        if set(row) != {'stage','index','httpStatus','hashes'} or row['stage']!='bucket' or type(row['index']) is not int or row['index']!=i:
            raise Stop('bucket evidence incomplete')
        allowed=(201,) if i==count-1 else (200,202)
        if type(row['httpStatus']) is not int or row['httpStatus'] not in allowed:
            raise Stop('documented completion not recorded')
        if not isinstance(row['hashes'],list) or not row['hashes']:
            raise Stop('bucket hash evidence missing')
        for h in row['hashes']:
            if not isinstance(h,str) or h not in known or h in seen:
                raise Stop('bucket hash evidence inconsistent')
            seen.add(h)
    # No arbitrary provider fields, tokens, headers, raw metadata or bodies copied.
    return copy.deepcopy({'schema': 'staffportal-upload-association/v1', 'archiveSha256': pkg['archive'],
            'workerSha256': digest(pkg['worker']), 'configSha256': pkg.get('config_sha256'),
            'originalAssetManifestSha256': pkg.get('asset_manifest_sha256'), 'baselineSha256': e['baselineSha256'],
            'versionId': version, 'providerManifest': pkg['manifest'], 'assetByteSha256': pkg['asset_sha256'],
            'completion': completion, 'association': association,
            'evidenceAuthority': 'local client record of validated provider responses; not a provider-signed receipt',
            'deliveredBytes': 'unverified; separate supported byte checks required',
            'activation': 'not performed; this evidence does not authorize activation'})
