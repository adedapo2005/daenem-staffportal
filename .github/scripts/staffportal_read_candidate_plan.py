"""Diagnostic-only candidate read projections. No network or publisher."""
from workers_api_plan import WorkersAPIPlan as BasePlan, utcnow, copy, canonical, sha, index_bindings, DYNAMIC, SOURCE_VERSION, VERSION_SETTINGS, Stop

class CandidateReadPlan(BasePlan):
    def __init__(self,window,clock=utcnow):
        super().__init__(window,clock);self._ai_project_pin=None

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


