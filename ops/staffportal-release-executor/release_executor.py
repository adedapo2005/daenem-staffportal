#!/usr/bin/env python3
"""StaffPortal approved artifact executor. No activation or database operations.

Run with python -I. Cloudflare upload is available only inside the fixed reviewed
GitHub workflow context. Tests inject dependencies; the CLI has no mock bypass.
"""
import argparse
import contextlib
import hashlib
import importlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT=Path(__file__).resolve().parent
REPO='adedapo2005/daenem-staffportal'
WORKFLOW='staffportal-approved-artifact-upload.yml'
WORKFLOW_REF=REPO+'/.github/workflows/'+WORKFLOW+'@refs/heads/main'
RELEASE_ID=434713012
APP_SHA='a95c11fadb53761e36e0f3295fd048b870e98d6d2b3486b73dfe61cdc4909080'
RUNTIME_SHA='537f3dfacc4bbee7ccd79ae0bf748796224543933859c36a916e6aca2d256c2d'
OPERATOR_MANIFEST='c15e06e6e62ddcda71d2009b7d6ab97ebb6e9d724bee4fe3e2b640e5ea334cc4'
PREPARER_SHA='391e463f9d54d465df2e92b426c7bc78978943085f2f91c75be1b12641143bd5'
HEX=re.compile(r'[0-9a-f]{64}\Z')
OP_FILES={'maintenance/worker.mjs','maintenance/wrangler.json','migration/worker.mjs','migration/wrangler.template.json','tools/operation.ps1','tools/prepare-window.ps1'}

class Held(Exception):
    def __init__(self,code): self.code=code;super().__init__(code)

def sha_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def read_json(path):return json.loads(Path(path).read_bytes().decode('utf-8-sig'))

def atomic_json(path,obj,forbidden=()):
    raw=(json.dumps(obj,indent=2,sort_keys=True)+'\n').encode()
    if any(s and s.encode() in raw for s in forbidden):raise Held('SANITIZATION_REFUSED_OUTPUT')
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.executor-')
    try:
        with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

class ExclusiveLock:
    """OS-held lock. A leftover lock file is not a stale-lock deletion request."""
    def __init__(self,path):self.path=Path(path);self.file=None
    def __enter__(self):
        self.path.parent.mkdir(parents=True,exist_ok=True);self.file=self.path.open('a+b')
        self.file.seek(0,2)
        if self.file.tell()==0:self.file.write(b'0');self.file.flush()
        self.file.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.file.close();self.file=None;raise Held('EXECUTION_LOCKED') from None
        return self
    def __exit__(self,*args):
        if self.file:
            if os.name=='nt':
                import msvcrt
                self.file.seek(0);msvcrt.locking(self.file.fileno(),msvcrt.LK_UNLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(),fcntl.LOCK_UN)
            self.file.close()

def load_runtime():
    sys.dont_write_bytecode=True
    pins=ROOT/'RUNTIME-PINS.json'
    if sha_file(pins)!=RUNTIME_SHA:raise Held('RUNTIME_MANIFEST_CHANGED')
    files=read_json(pins)['files'];directory=ROOT/'runtime'
    actual={p.name for p in directory.iterdir()}
    if actual!=set(files):raise Held('UNREVIEWED_RUNTIME_MEMBER')
    for name,pin in files.items():
        if Path(name).name!=name or sha_file(directory/name)!=pin:raise Held('RUNTIME_SOURCE_CHANGED')
        module=sys.modules.get(Path(name).stem) if name.endswith('.py') else None
        if module is not None and (not getattr(module,'__file__',None) or sha_file(module.__file__)!=pin):
            raise Held('UNREVIEWED_PRELOADED_MODULE')
    sys.path.insert(0,str(directory))
    return {name:importlib.import_module(name) for name in ('publisher','workers_api_plan','workers_api_adapter')}

def validate_operator_package(path):
    path=Path(path)
    if sha_file(path/'release-manifest.json')!=OPERATOR_MANIFEST:raise Held('OPERATOR_MANIFEST_CHANGED')
    manifest=read_json(path/'release-manifest.json')
    if set(manifest.get('files',{}))!=OP_FILES:raise Held('OPERATOR_INPUT_SET_CHANGED')
    for name,pin in manifest['files'].items():
        if sha_file(path/name)!=pin:raise Held('OPERATOR_INPUT_CHANGED')
    if sha_file(path/'tools/prepare-window.ps1')!=PREPARER_SHA:raise Held('PREPARER_CHANGED')
    return path

def package_operator(source,output):
    source=validate_operator_package(source).resolve();output=Path(output).resolve()
    if source==output or source in output.parents:raise Held('OPERATOR_PACKAGE_OUTPUT_MUST_BE_SEPARATE')
    names=OP_FILES|{'release-manifest.json'};payload={n:(source/n).read_bytes() for n in names}
    manifest=json.loads(payload['release-manifest.json'].decode('utf-8-sig'))
    if hashlib.sha256(payload['release-manifest.json']).hexdigest()!=OPERATOR_MANIFEST or any(hashlib.sha256(payload[n]).hexdigest()!=pin for n,pin in manifest['files'].items()):
        raise Held('OPERATOR_SOURCE_CHANGED_DURING_CAPTURE')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for name in sorted(names):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,payload[name])
    with zipfile.ZipFile(output) as z:
        if set(z.namelist())!=names or any(z.read(n)!=payload[n] for n in names):raise Held('OPERATOR_CAPTURE_VERIFICATION_FAILED')
    validate_operator_package(source)
    return {'state':'OPERATOR_INPUT_ARCHIVE_VERIFIED','files':7,'operatorArchiveSha256':sha_file(output),'operatorManifestSha256':OPERATOR_MANIFEST,'hostedCalls':0}


def extract_operator(archive,destination):
    destination=Path(destination)
    if destination.exists():raise Held('OPERATOR_DESTINATION_EXISTS')
    allowed=OP_FILES|{'release-manifest.json'}
    with zipfile.ZipFile(archive) as z:
        entries=[i for i in z.infolist() if not i.is_dir()]
        if {i.filename for i in entries}!=allowed or len(entries)!=len(allowed):raise Held('OPERATOR_ARCHIVE_MEMBER_SET')
        if any(i.file_size>64*1024*1024 or (i.external_attr>>16)&0o170000==0o120000 for i in entries):raise Held('OPERATOR_ARCHIVE_UNSUPPORTED')
        # Authenticate the manifest before installing or invoking any input.
        if hashlib.sha256(z.read('release-manifest.json')).hexdigest()!=OPERATOR_MANIFEST:raise Held('OPERATOR_MANIFEST_CHANGED')
        manifest=json.loads(z.read('release-manifest.json').decode('utf-8-sig'))
        if set(manifest['files'])!=OP_FILES:raise Held('OPERATOR_INPUT_SET_CHANGED')
        payload={name:z.read(name) for name in allowed}
        if any(hashlib.sha256(payload[n]).hexdigest()!=h for n,h in manifest['files'].items()):raise Held('OPERATOR_INPUT_CHANGED')
    destination.mkdir(parents=True)
    for name,raw in payload.items():
        p=destination/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
    validate_operator_package(destination)

class GitHubReader:
    def __init__(self,env):
        if not env.get('GH_TOKEN'):raise Held('GITHUB_READ_TOKEN_MISSING')
        self.env={**os.environ,'GH_TOKEN':env['GH_TOKEN'],'GH_HOST':'github.com'}
    def json(self,path):
        if not path.startswith('repos/'+REPO+'/'):raise Held('GITHUB_SCOPE_MISMATCH')
        p=subprocess.run(['gh','api',path,'-H','Accept: application/vnd.github+json'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=self.env,check=False)
        if p.returncode or len(p.stdout)>8*1024*1024:raise Held('GITHUB_READ_UNAVAILABLE')
        try:return json.loads(p.stdout)
        except (ValueError,UnicodeDecodeError):raise Held('GITHUB_READ_MALFORMED') from None
    def download(self,asset_id,path):
        with Path(path).open('xb') as f:
            p=subprocess.run(['gh','api',f'repos/{REPO}/releases/assets/{asset_id}','-H','Accept: application/octet-stream'],stdout=f,stderr=subprocess.DEVNULL,env=self.env,check=False)
        if p.returncode:raise Held('INPUT_DOWNLOAD_UNCONFIRMED')

def github_context(env):
    wanted={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':REPO,'GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_RUN_ATTEMPT':'1','GITHUB_WORKFLOW_REF':WORKFLOW_REF}
    if any(env.get(k)!=v for k,v in wanted.items()):raise Held('GITHUB_CONTEXT_NOT_APPROVED')
    if not re.fullmatch(r'[0-9a-f]{40}',env.get('GITHUB_WORKFLOW_SHA','')) or env.get('GITHUB_SHA')!=env['GITHUB_WORKFLOW_SHA'] or not re.fullmatch(r'[1-9][0-9]*',env.get('GITHUB_RUN_ID','')):
        raise Held('GITHUB_RUN_IDENTITY_INVALID')
    return {'runId':env['GITHUB_RUN_ID'],'workflowSha':env['GITHUB_WORKFLOW_SHA'],'workflow':WORKFLOW,'repository':REPO}

def reconcile_input_read_failure(reader, row, workflow_id):
    """One inspected failure before preparation, attempt marker or Cloudflare.

    The retained evidence ZIP was inspected offline and contains only the
    prior history guard and GITHUB_READ_UNAVAILABLE hold. Its identity and
    digest must still match. This exception never authorizes a write retry.
    """
    rid=42064065206
    source_sha='bfd805f84ebdc46afa8c45da685ccdc9f52d0824'
    expected={'id':rid,'run_attempt':1,'workflow_id':408290809,
              'head_sha':source_sha,'head_branch':'main','event':'workflow_dispatch',
              'status':'completed','conclusion':'failure',
              'path':'.github/workflows/'+WORKFLOW}
    if workflow_id!=408290809 or any(row.get(k)!=v for k,v in expected.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    prefix=f'repos/{REPO}/actions/runs/{rid}'
    run=reader.json(prefix)
    if any(run.get(k)!=v for k,v in expected.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/jobs?per_page=100');jobs=data.get('jobs')
    if data.get('total_count')!=1 or not isinstance(jobs,list) or len(jobs)!=1:
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    job=jobs[0]
    if any(job.get(k)!=v for k,v in {'id':127373236128,'name':'upload',
            'run_id':rid,'status':'completed','conclusion':'failure'}.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    expected_steps=[
        ('Set up job','success'),('Initialize Private Runner Paths','success'),
        ('Check Out The Exact Workflow Commit','success'),
        ('Verify Executor Inputs Before Running Python','success'),
        ('Set Up Pinned Python','success'),('Reject Reruns And Earlier Attempts','success'),
        ('Download Only The Hash-Pinned Inputs','failure'),
        ('Prepare The Approved Local Window','skipped'),
        ('Preserve A Pre-Upload Attempt Marker','skipped'),
        ('Upload And Verify Without Activation','skipped'),
        ('Preserve Sanitized Journal And Verification','success'),
        ('Post Set Up Pinned Python','skipped'),
        ('Post Check Out The Exact Workflow Commit','success'),('Complete job','success')]
    steps=job.get('steps')
    if not isinstance(steps,list) or [(s.get('name'),s.get('conclusion')) for s in steps]!=expected_steps or any(s.get('status')!='completed' for s in steps):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/artifacts?per_page=100');artifacts=data.get('artifacts')
    if data.get('total_count')!=1 or not isinstance(artifacts,list) or len(artifacts)!=1:
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    artifact=artifacts[0]
    pin={'id':13433685525,'name':'staffportal-upload-evidence-42064065206',
         'size_in_bytes':878,'expired':False,
         'digest':'sha256:3ed0402974b137c3fc157f3bbf92bd93df9c78d1e22b1221620883bbb5db80e3'}
    identity={'id':rid,'repository_id':1363396851,'head_repository_id':1363396851,
              'head_sha':source_sha,'head_branch':'main'}
    if any(artifact.get(k)!=v for k,v in pin.items()) or any((artifact.get('workflow_run') or {}).get(k)!=v for k,v in identity.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    return {'runId':rid,'sourceSha':source_sha,'jobId':job['id'],
            'evidenceArtifactId':pin['id'],'evidenceArtifactDigest':pin['digest'],
            'disposition':'verified input-read failure before preparation, marker and Cloudflare step'}

def reconcile_account_rejection(reader,row,workflow_id):
    """Inspected exact account rejection before journal/adapter creation.

    Local preparation and a GitHub marker exist for this run. Both retained
    ZIPs were inspected: no publisher journal or remote-operation record is
    present. The pinned source rejects the account before any adapter call.
    """
    rid=42075233917;source='47ac8e82b36ae92201ecbae4a035881b1f7c17d4'
    expected={'id':rid,'run_attempt':1,'workflow_id':408290809,'head_sha':source,
              'head_branch':'main','event':'workflow_dispatch','status':'completed',
              'conclusion':'failure','path':'.github/workflows/'+WORKFLOW}
    if workflow_id!=408290809 or any(row.get(k)!=v for k,v in expected.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    prefix=f'repos/{REPO}/actions/runs/{rid}'
    run=reader.json(prefix)
    if any(run.get(k)!=v for k,v in expected.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/jobs?per_page=100');jobs=data.get('jobs')
    if data.get('total_count')!=1 or not isinstance(jobs,list) or len(jobs)!=1:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    job=jobs[0]
    if any(job.get(k)!=v for k,v in {'id':127413569396,'run_id':rid,'name':'upload',
            'status':'completed','conclusion':'failure'}.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    steps=[('Set up job','success'),('Initialize Private Runner Paths','success'),
           ('Check Out The Exact Workflow Commit','success'),('Verify Executor Inputs Before Running Python','success'),
           ('Set Up Pinned Python','success'),('Reject Reruns And Earlier Attempts','success'),
           ('Download Only The Hash-Pinned Inputs','success'),('Prepare The Approved Local Window','success'),
           ('Preserve A Pre-Upload Attempt Marker','success'),('Upload And Verify Without Activation','failure'),
           ('Preserve Sanitized Journal And Verification','success'),('Post Set Up Pinned Python','skipped'),
           ('Post Check Out The Exact Workflow Commit','success'),('Complete job','success')]
    actual=job.get('steps')
    if not isinstance(actual,list) or [(s.get('name'),s.get('conclusion')) for s in actual]!=steps or any(s.get('status')!='completed' for s in actual):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/artifacts?per_page=100');artifacts=data.get('artifacts')
    if data.get('total_count')!=2 or not isinstance(artifacts,list) or len(artifacts)!=2:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    pins={13439105131:('staffportal-pre-upload-42075233917',1189,'58806f628b1b517030b596b0528dc29b42bbcdee9139d2347af28b4f43845393'),
          13438950239:('staffportal-upload-evidence-42075233917',1748,'5e86ceab46ce3b3959014f2d96186c23bb3b10d126df905ca5ca5c1aa45c3a96')}
    seen=set()
    for artifact in artifacts:
        aid=artifact.get('id')
        if aid not in pins or aid in seen:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
        seen.add(aid);name,size,digest=pins[aid]
        identity={'id':rid,'repository_id':1363396851,'head_repository_id':1363396851,'head_sha':source,'head_branch':'main'}
        if artifact.get('name')!=name or artifact.get('size_in_bytes')!=size or artifact.get('digest')!='sha256:'+digest or artifact.get('expired') is not False or any((artifact.get('workflow_run') or {}).get(k)!=v for k,v in identity.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    return {'runId':rid,'sourceSha':source,'jobId':job['id'],'evidenceArtifactIds':sorted(seen),
            'disposition':'verified account rejection before publisher journal or adapter; local preparation and GitHub marker retained'}

def verify_account_identity(env,expected):
    # Match the established staging workflow's whitespace removal, then keep
    # the exact pinned account comparison. Never print or persist the input.
    raw=env.get('CLOUDFLARE_ACCOUNT_ID','')
    if not isinstance(raw,str) or ''.join(raw.split())!=expected:
        raise Held('CLOUDFLARE_ACCOUNT_MISMATCH')

def safe_failure_code(error,runtime):
    """Fixed labels only; provider messages and exception text stay private."""
    if isinstance(error,Held):return error.code
    publisher=runtime['publisher']
    if isinstance(error,publisher.Rejected):return 'CLOUDFLARE_REQUEST_REJECTED'
    if isinstance(error,publisher.Uncertain):return 'CLOUDFLARE_REQUEST_OUTCOME_UNKNOWN'
    if isinstance(error,publisher.Stop):
        return {'binding resource, restriction or value drift':'BINDING_RESOURCE_OR_VALUE_DRIFT',
                'AI project read metadata malformed':'AI_PROJECT_READ_METADATA_MALFORMED',
                'AI project read metadata changed during execution':'AI_PROJECT_READ_METADATA_CHANGED',
                'version runtime setting drift or missing value':'RUNTIME_SETTING_HELD',
                'current and explicit source bindings differ':'SOURCE_CURRENT_BINDINGS_DIFFER',
                'deployment/source allocation drift':'DEPLOYMENT_ALLOCATION_DRIFT',
                'execution baseline changed between drift checks':'EXECUTION_BASELINE_CHANGED'
                }.get(str(error),'PUBLISHER_BOUNDARY_HELD')
    return 'EXECUTION_HELD'

def review_prior_asset_staging(reader,row,workflow_id,owner_acceptance):
    """Explicit fresh-session decision; never claim the prior asset outcome.

    Both pinned ZIPs were inspected. The journal records no version attempt,
    but completed asset operations are not retained by that old journal.
    Keep that uncertainty and its old HELD state; never automatically resume it.
    """
    if owner_acceptance is not True:raise Held('PRIOR_ASSET_STAGING_OWNER_ACCEPTANCE_REQUIRED')
    rid=42078524520;source='e39946b76c4194c8f68cbb78cc5576400292fae7'
    expected={'id':rid,'run_attempt':1,'workflow_id':408290809,'head_sha':source,
              'head_branch':'main','event':'workflow_dispatch','status':'completed',
              'conclusion':'failure','path':'.github/workflows/'+WORKFLOW}
    if workflow_id!=408290809 or any(row.get(k)!=v for k,v in expected.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    prefix=f'repos/{REPO}/actions/runs/{rid}'
    run=reader.json(prefix)
    if any(run.get(k)!=v for k,v in expected.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/jobs?per_page=100');jobs=data.get('jobs')
    if data.get('total_count')!=1 or not isinstance(jobs,list) or len(jobs)!=1:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    job=jobs[0]
    if any(job.get(k)!=v for k,v in {'id':127425094817,'run_id':rid,'name':'upload','status':'completed','conclusion':'failure'}.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    steps=[('Set up job','success'),('Initialize Private Runner Paths','success'),
           ('Check Out The Exact Workflow Commit','success'),('Verify Executor Inputs Before Running Python','success'),
           ('Set Up Pinned Python','success'),('Reject Reruns And Earlier Attempts','success'),
           ('Verify Exact Cloudflare Account Before Preparation','success'),('Download Only The Hash-Pinned Inputs','success'),
           ('Prepare The Approved Local Window','success'),('Preserve A Pre-Upload Attempt Marker','success'),
           ('Upload And Verify Without Activation','failure'),('Preserve Sanitized Journal And Verification','success'),
           ('Post Set Up Pinned Python','skipped'),('Post Check Out The Exact Workflow Commit','success'),('Complete job','success')]
    actual=job.get('steps')
    if not isinstance(actual,list) or [(s.get('name'),s.get('conclusion')) for s in actual]!=steps or any(s.get('status')!='completed' for s in actual):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/artifacts?per_page=100');artifacts=data.get('artifacts')
    if data.get('total_count')!=2 or not isinstance(artifacts,list) or len(artifacts)!=2:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    pins={13439382902:('staffportal-pre-upload-42078524520',1322,'49d2975dca923ea9f6e5d92e52fd7e6fd17ee0ea4f13bd83458884c82cb89c43'),
          13438648323:('staffportal-upload-evidence-42078524520',2666,'72fc078d5a15b88f92e782192e2f0ef4b7a09b030a414495159b497b491aa622')}
    seen=set()
    for item in artifacts:
        aid=item.get('id')
        if aid not in pins or aid in seen:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
        seen.add(aid);name,size,digest=pins[aid]
        identity={'id':rid,'repository_id':1363396851,'head_repository_id':1363396851,'head_sha':source,'head_branch':'main'}
        if item.get('name')!=name or item.get('size_in_bytes')!=size or item.get('digest')!='sha256:'+digest or item.get('expired') is not False or any((item.get('workflow_run') or {}).get(k)!=v for k,v in identity.items()):raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    return {'runId':rid,'sourceSha':source,'jobId':job['id'],'evidenceArtifactIds':sorted(seen),
            'priorAssetStaging':'UNKNOWN','priorVersionAttempted':False,'priorJournalRemainsHeld':True,
            'ownerDecision':'new Owner-approved session request; prior asset work may have committed',
            'automaticRetryAuthorized':False}

def require_fresh_session_review(env,guard):
    if env.get('SP_FRESH_SESSION_REVIEW')!='42078524520' or guard.get('ownerAcceptedUnknownAssetStagingRun')!=42078524520:
        raise Held('PRIOR_ASSET_STAGING_OWNER_ACCEPTANCE_REQUIRED')

def reconcile_known_preupload_failure(reader, row, workflow_id, *, owner_acceptance=False):
    """Exact captured failures before Cloudflare adapter access.

    This is not a generic failed-run exception. Any changed attempt, metadata,
    step outcome or artifact makes the historical attempt unresolved again.
    """
    if row.get('id')==42078524520:
        if owner_acceptance is not True:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
        return review_prior_asset_staging(reader,row,workflow_id,owner_acceptance)
    if row.get('id')==42075233917:
        return reconcile_account_rejection(reader,row,workflow_id)
    if row.get('id')==42064065206:
        return reconcile_input_read_failure(reader,row,workflow_id)
    profiles={
        42053174449:('c65f9c01e528c5e737e1de512a9b225e8104467c',127334404887,'manifest'),
        42060035942:('1a9d6092e7047d27921a43eb8b6c1b1e5f22195e',127358827488,'python')}
    rid=row.get('id')
    if rid not in profiles or row.get('run_attempt')!=1 or workflow_id!=408290809:
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    source_sha,job_id,failed_setup=profiles[rid]
    prefix=f'repos/{REPO}/actions/runs/{rid}'
    run=reader.json(prefix)
    expected={'id':rid,'run_attempt':1,'workflow_id':workflow_id,
              'head_sha':source_sha,
              'head_branch':'main','event':'workflow_dispatch','status':'completed',
              'conclusion':'failure','path':'.github/workflows/'+WORKFLOW}
    if any(run.get(k)!=v for k,v in expected.items()):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    data=reader.json(prefix+'/jobs?per_page=100')
    jobs=data.get('jobs')
    if data.get('total_count')!=1 or not isinstance(jobs,list) or len(jobs)!=1:
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    job=jobs[0]
    if job.get('id')!=job_id or job.get('name')!='upload' or job.get('status')!='completed' or job.get('conclusion')!='failure':
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    expected_steps=[
        ('Set up job','success'),('Initialize Private Runner Paths','success'),
        ('Check Out The Exact Workflow Commit','success'),
        ('Verify Executor Inputs Before Running Python','failure' if failed_setup=='manifest' else 'success'),
        ('Set Up Pinned Python','skipped' if failed_setup=='manifest' else 'failure'),('Reject Reruns And Earlier Attempts','skipped'),
        ('Download Only The Hash-Pinned Inputs','skipped'),
        ('Prepare The Approved Local Window','skipped'),
        ('Preserve A Pre-Upload Attempt Marker','skipped'),
        ('Upload And Verify Without Activation','skipped'),
        ('Preserve Sanitized Journal And Verification','success'),
        ('Post Check Out The Exact Workflow Commit','success'),('Complete job','success')]
    if failed_setup=='python':expected_steps.insert(-2,('Post Set Up Pinned Python','skipped'))
    steps=job.get('steps')
    if not isinstance(steps,list) or [(s.get('name'),s.get('conclusion')) for s in steps]!=expected_steps or any(s.get('status')!='completed' for s in steps):
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    artifacts=reader.json(prefix+'/artifacts?per_page=100')
    if artifacts.get('total_count')!=0 or artifacts.get('artifacts')!=[]:
        raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
    return {'runId':rid,'sourceSha':expected['head_sha'],'jobId':job['id'],
            'disposition':'verified failure before input download, preparation and Cloudflare step'}

def workflow_guard(env,reader):
    context=github_context(env)
    wf=reader.json(f'repos/{REPO}/actions/workflows/{WORKFLOW}')
    if type(wf.get('id')) is not int or wf.get('path')!='.github/workflows/'+WORKFLOW or wf.get('state')!='active':raise Held('WORKFLOW_IDENTITY_UNVERIFIED')
    seen=set();declared=None;reconciled=[]
    for page in range(1,21):
        data=reader.json(f'repos/{REPO}/actions/workflows/{wf["id"]}/runs?per_page=100&page={page}')
        rows=data.get('workflow_runs');total=data.get('total_count')
        if not isinstance(rows,list) or type(total) is not int or total<1 or (declared is not None and total!=declared):raise Held('WORKFLOW_HISTORY_INCOMPLETE')
        declared=total
        for row in rows:
            rid=row.get('id')
            if type(rid) is not int or rid in seen:raise Held('WORKFLOW_HISTORY_INCOMPLETE')
            seen.add(rid)
            if str(rid)==context['runId']:
                if row.get('run_attempt')!=1:raise Held('PRIOR_RUN_REQUIRES_RECONCILIATION')
            else:
                reconciled.append(reconcile_known_preupload_failure(reader,row,wf['id'],owner_acceptance=env.get('SP_FRESH_SESSION_REVIEW')=='42078524520'))
        if len(rows)<100:break
    else:raise Held('WORKFLOW_HISTORY_INCOMPLETE')
    if len(seen)!=declared or int(context['runId']) not in seen or len(seen)!=1+len(reconciled):raise Held('WORKFLOW_HISTORY_INCOMPLETE')
    accepted=42078524520 if any(r.get('runId')==42078524520 and r.get('priorAssetStaging')=='UNKNOWN' for r in reconciled) else None
    if env.get('SP_FRESH_SESSION_REVIEW')=='42078524520' and accepted is None:raise Held('PRIOR_ASSET_STAGING_REVIEW_NOT_IN_HISTORY')
    return {**context,'workflowId':wf['id'],'guard':'FIRST_PUBLISHING_RUN_ONLY',
            'ownerAcceptedUnknownAssetStagingRun':accepted,
            'reconciledPreuploadRuns':reconciled,
            'meaning':'exact captured history plus explicit Owner fresh-session acceptance of unknown asset staging; not a provider idempotency fence'}

def fetch_inputs(reader,application_id,operator_id,operator_sha,destination):
    if not re.fullmatch(r'[1-9][0-9]*',application_id) or not re.fullmatch(r'[1-9][0-9]*',operator_id) or application_id==operator_id or not HEX.fullmatch(operator_sha):raise Held('INPUT_IDENTIFIERS_INVALID')
    required={int(application_id),int(operator_id)};found={}
    for page in range(1,21):
        rows=reader.json(f'repos/{REPO}/releases/{RELEASE_ID}/assets?per_page=100&page={page}')
        if not isinstance(rows,list):raise Held('RELEASE_ASSET_LIST_UNAVAILABLE')
        for item in rows:
            if item.get('id') in required:
                if item['id'] in found:raise Held('RELEASE_ASSET_LIST_INCOMPLETE')
                found[item['id']]=item
        if len(rows)<100:break
    else:raise Held('RELEASE_ASSET_LIST_INCOMPLETE')
    if set(found)!=required:raise Held('REQUIRED_INPUT_ASSETS_NOT_STAGED')
    dest=Path(destination)
    if dest.exists():raise Held('INPUT_DIRECTORY_EXISTS')
    dest.mkdir(parents=True)
    for aid,name,pin in [(int(application_id),'application.zip',APP_SHA),(int(operator_id),'operator.zip',operator_sha)]:
        item=found[aid]
        if type(item.get('size')) is not int or not 0<item['size']<=2*1024**3:raise Held('INPUT_SIZE_UNSUPPORTED')
        path=dest/name;reader.download(aid,path)
        if path.stat().st_size!=item['size'] or sha_file(path)!=pin:raise Held('INPUT_DOWNLOAD_HASH_MISMATCH')
    extract_operator(dest/'operator.zip',dest/'operator')
    return {'sourceReleaseId':RELEASE_ID,'applicationAssetId':int(application_id),'operatorAssetId':int(operator_id),'applicationSha256':APP_SHA,'operatorArchiveSha256':operator_sha}

class Dependencies:
    def __init__(self,runtime):self.runtime=runtime
    def package(self,path):return self.runtime['publisher'].load_package(path)
    def operator(self,path):return validate_operator_package(path)
    def window(self,path,pin):return self.runtime['workers_api_plan'].PreparedWindow.load(path,pin)
    def plan(self,window):return self.runtime['workers_api_plan'].WorkersAPIPlan(window)
    def adapter(self,token,window,plan):return self.runtime['workers_api_adapter'].WorkersAPIAdapter(token,window,plan=plan)
    def prepare(self,operator,start,window):
        if os.name!='nt':raise Held('WINDOWS_PREPARATION_REQUIRES_WINDOWS')
        p=subprocess.run(['pwsh.exe','-NoLogo','-NoProfile','-NonInteractive','-File',str(Path(operator)/'tools/prepare-window.ps1'),'-StartUtc',start,'-WindowDirectory',str(Path(window).resolve())],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
        if p.returncode:raise Held('WINDOW_PREPARATION_UNCONFIRMED')

def paths_separate(state,private,operator):
    state,private,operator=map(lambda p:Path(p).resolve(),(state,private,operator))
    if any(a==b or a in b.parents or b in a.parents for a,b in ((state,private),(state,operator),(private,operator))):raise Held('PRIVATE_AND_PUBLIC_PATHS_OVERLAP')

def execute(args,env=None,deps=None,reader=None):
    env=os.environ if env is None else env
    runtime=load_runtime();deps=deps or Dependencies(runtime)
    out=Path(args.state_dir);out.mkdir(parents=True,exist_ok=True)
    result_path=out/'result.json';journal_path=out/'journal.json';forbidden=[];journal=None
    try:
        if args.command=='package-operator':
            result=package_operator(args.operator_package,args.output_zip);atomic_json(out/'operator-input.json',result);return result
        if args.command=='guard':
            result=workflow_guard(env,reader or GitHubReader(env));atomic_json(out/'github-guard.json',result);return result
        if args.command=='account-check':
            github_context(env);verify_account_identity(env,runtime['publisher'].ACCOUNT)
            result={'state':'CLOUDFLARE_ACCOUNT_IDENTITY_VERIFIED','cloudflareCalls':0}
            atomic_json(out/'account-check.json',result);return result
        if args.command=='fetch':
            github_context(env)
            result=fetch_inputs(reader or GitHubReader(env),args.application_asset_id,args.operator_asset_id,args.operator_archive_sha256,args.inputs_dir)
            atomic_json(out/'inputs.json',result);return result
        if args.command=='status':
            if not journal_path.exists():return {'state':'NO_LOCAL_JOURNAL','meaning':'does not establish no earlier remote attempt'}
            j=read_json(journal_path);v=j.get('version_id')
            return {'state':j.get('execution_state','UNKNOWN'),'versionId':v if isinstance(v,str) and re.fullmatch('[0-9a-f-]{36}',v) else None,'pendingKind':(j.get('pending') or {}).get('kind'),'retryAuthorized':False}
        paths_separate(out,args.window_dir,args.operator_package)
        pkg=deps.package(args.application_zip);deps.operator(args.operator_package)
        if args.command=='review':
            result_path=out/'review.json'
            result={'state':'LOCAL_INPUTS_VERIFIED','applicationSha256':APP_SHA,'runtimePinsSha256':RUNTIME_SHA,'operatorManifestSha256':OPERATOR_MANIFEST,'hostedCalls':0,'windowPrepared':False}
            atomic_json(result_path,result);return result
        if args.command=='prepare':
            if not args.prepare_approved_window:raise Held('WINDOW_PREPARATION_NOT_REQUESTED')
            if (out/'preparation.json').exists() or journal_path.exists():raise Held('EXISTING_WINDOW_OR_ATTEMPT_REQUIRES_REVIEW')
            if Path(args.window_dir).exists():raise Held('WINDOW_DIRECTORY_MUST_BE_NEW')
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',args.start_utc):raise Held('EXPLICIT_UTC_START_REQUIRED')
            deps.prepare(args.operator_package,args.start_utc,args.window_dir)
            pin=sha_file(Path(args.window_dir)/'window.json');window=deps.window(args.window_dir,pin)
            result={'state':'WINDOW_PREPARED_LOCALLY','windowSha256':pin,'preparedConfigSha256':window.config_sha256,'applicationSha256':APP_SHA,'runtimePinsSha256':RUNTIME_SHA,'hostedCalls':0}
            atomic_json(out/'preparation.json',result);return result
        if args.command!='upload':raise Held('UNSUPPORTED_COMMAND')
        if not args.execute_approved_upload:raise Held('UPLOAD_NOT_REQUESTED')
        context=github_context(env)
        guard=read_json(out/'github-guard.json')
        if any(guard.get(k)!=v for k,v in context.items()) or guard.get('guard')!='FIRST_PUBLISHING_RUN_ONLY':raise Held('MATCHING_RUN_GUARD_REQUIRED')
        require_fresh_session_review(env,guard)
        preparation=read_json(out/'preparation.json')
        if preparation.get('state')!='WINDOW_PREPARED_LOCALLY' or preparation.get('applicationSha256')!=APP_SHA or preparation.get('runtimePinsSha256')!=RUNTIME_SHA:raise Held('PREPARATION_RECORD_MISMATCH')
        window=deps.window(args.window_dir,preparation['windowSha256']);plan=deps.plan(window);plan.window.check(plan.clock)
        if not re.fullmatch(r'[1-9][0-9]*',args.marker_artifact_id) or not HEX.fullmatch(args.marker_artifact_digest):raise Held('PREWRITE_ARTIFACT_RECEIPT_REQUIRED')
        receipt=(reader or GitHubReader(env)).json(f'repos/{REPO}/actions/artifacts/{args.marker_artifact_id}')
        if str(receipt.get('id'))!=args.marker_artifact_id or receipt.get('name')!='staffportal-pre-upload-'+context['runId'] or receipt.get('expired') is not False or receipt.get('digest')!='sha256:'+args.marker_artifact_digest or str((receipt.get('workflow_run') or {}).get('id'))!=context['runId']:
            raise Held('PREWRITE_ARTIFACT_RECEIPT_MISMATCH')
        token=env.get('CLOUDFLARE_API_TOKEN','')
        if not token:raise Held('CLOUDFLARE_ENVIRONMENT_TOKEN_MISSING')
        verify_account_identity(env,runtime['publisher'].ACCOUNT)
        forbidden=[token,env.get('GH_TOKEN',''),*window.values().values()]
        bind={**context,'archiveSha256':APP_SHA,'runtimePinsSha256':RUNTIME_SHA,'windowSha256':preparation['windowSha256'],'markerArtifactId':args.marker_artifact_id,'markerArtifactDigest':args.marker_artifact_digest}
        BaseJournal=runtime['publisher'].Journal
        class SafeJournal(BaseJournal):
            def _save(self):
                raw=json.dumps(self.data,sort_keys=True)
                if any(s and s in raw for s in forbidden):raise Held('JOURNAL_SANITIZATION_REFUSED')
                super()._save()
        with ExclusiveLock(out/'execution.lock'):
            journal=SafeJournal(journal_path)
            if journal.data.get('execution_state') is not None or journal.data.get('pending') is not None or journal.data.get('version_attempted'):
                raise Held('PRIOR_EXECUTION_REQUIRES_RECONCILIATION')
            if journal.data.get('context') not in (None,bind):raise Held('JOURNAL_CONTEXT_MISMATCH')
            journal.data['context']=bind;journal.data['execution_state']='STARTED_HOLD_IF_INTERRUPTED';journal._save()
            adapter=deps.adapter(token,window,plan)
            try:
                evidence=runtime['publisher'].Publisher(adapter,journal,plan.publisher_expectations()).upload_only(pkg)
            except Exception:
                journal.data['execution_state']='HELD_NO_AUTOMATIC_RETRY';journal._save();raise
            journal.data['execution_state']='UPLOAD_VERIFIED_ALLOCATION_UNCHANGED';journal._save()
            result={'state':'UPLOAD_VERIFIED_ALLOCATION_UNCHANGED','context':bind,'verification':evidence,'activationPerformed':False,'deliveredBytesVerified':False,'retryAuthorized':False}
            atomic_json(result_path,result,forbidden);return result
    except Exception as error:
        code=safe_failure_code(error,runtime)
        result={'state':'HELD','code':code,'retryAuthorized':False,'activationPerformed':False}
        if journal is not None:
            v=journal.data.get('version_id');result['versionId']=v if isinstance(v,str) and re.fullmatch('[0-9a-f-]{36}',v) else None
            result['pendingKind']=(journal.data.get('pending') or {}).get('kind')
        atomic_json(out/('hold-'+str(time.time_ns())+'.json'),result,forbidden)
        raise Held(code) from None

def parser():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    for cmd in ('review','prepare','upload','status','guard','account-check','fetch','package-operator'):
        q=sub.add_parser(cmd);q.add_argument('--state-dir',required=True)
        if cmd in ('review','prepare','upload'):
            q.add_argument('--application-zip',required=True);q.add_argument('--operator-package',required=True);q.add_argument('--window-dir',required=True)
        if cmd=='prepare':q.add_argument('--start-utc',required=True);q.add_argument('--prepare-approved-window',action='store_true')
        if cmd=='upload':q.add_argument('--execute-approved-upload',action='store_true');q.add_argument('--marker-artifact-id',required=True);q.add_argument('--marker-artifact-digest',required=True)
        if cmd=='package-operator':q.add_argument('--operator-package',required=True);q.add_argument('--output-zip',required=True)
        if cmd=='fetch':q.add_argument('--application-asset-id',required=True);q.add_argument('--operator-asset-id',required=True);q.add_argument('--operator-archive-sha256',required=True);q.add_argument('--inputs-dir',required=True)
    return p

def main():
    args=parser().parse_args()
    try:
        result=execute(args)
        # Do not echo evidence, capabilities, inputs or provider responses.
        print(json.dumps({'state':result.get('state',result.get('guard','COMPLETE')),'retryAuthorized':False}));return 0
    except Exception as error:
        print(json.dumps({'state':'HELD','code':error.code if isinstance(error,Held) else 'LOCAL_EXECUTOR_ERROR','retryAuthorized':False}));return 2

if __name__=='__main__':raise SystemExit(main())
