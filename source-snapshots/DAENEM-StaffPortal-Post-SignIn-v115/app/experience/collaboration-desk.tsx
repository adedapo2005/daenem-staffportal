"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Eye,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";
import {useLab} from './lab-context';
import {useDeviceState} from './device-state';
import {recordsFor,byId,canRecordAct,personFor,attentionRecords,fieldAccess} from './model';
import {Btn,Panel,Badge,Empty,Pick,Avatar} from './ui';
import { QuickInspection } from "./record-workspace";
import {formatRecordDateTime12} from './time-standard';
type Message={id:string;actor:string;text:string;time:string};
type ConversationState = {
  query: string;
  visibility: "All" | "Unread" | "Read";
  sort: "Recent" | "Title";
  selectedId: string;
  scrollTop: number;
};

function parseMessages(row: ReturnType<typeof recordsFor>[number] | undefined) {
  if (!row) return [];
  let messages: Message[] = [];
  try {
    messages = JSON.parse(row.fields["Message History"] || "[]");
  } catch {
    messages = [];
  }
  const source = row.fields.Message;
  return source
    ? [
        {
          id: "source",
          actor: row.owner,
          text: source,
          time: row.history[0]?.time || "Fixture Message",
        },
        ...messages,
      ]
    : messages;
}

export function StaffChat() {
  const { session, records, mutate, open } = useLab();
  const m = byId("staff-messaging")!;
  const channels = recordsFor(records, m, session);
  const [state, setState] = useDeviceState<ConversationState>(
    `conversation-workspace-${session.personId}-${session.company}`,
    { query: "", visibility: "All", sort: "Recent", selectedId: "", scrollTop: 0 },
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [quickId, setQuickId] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [read, setRead] = useDeviceState<string[]>(
    `chat-read-${session.personId}-${session.company}`,
    [],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const channelButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const quickButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const mobileReturnFocusRef = useRef(false);
  const filteredChannels = (() => {
    const query = state.query.trim().toLowerCase();
    return channels
      .filter((channel) => {
        const searchable = `${channel.title} ${channel.fields.Channel || ""} ${channel.fields.Department || ""} ${channel.fields.Message || ""}`.toLowerCase();
        const matchesQuery = !query || searchable.includes(query);
        const isRead = read.includes(channel.id);
        const matchesVisibility =
          state.visibility === "All" ||
          (state.visibility === "Read" ? isRead : !isRead);
        return matchesQuery && matchesVisibility;
      })
      .sort((left, right) =>
        state.sort === "Title"
          ? left.title.localeCompare(right.title)
          : String(right.history.at(-1)?.time || right.due).localeCompare(
              String(left.history.at(-1)?.time || left.due),
            ),
      );
  })();
  const row =
    filteredChannels.find((channel) => channel.id === state.selectedId) ||
    filteredChannels[0];
  const selectedIndex = row ? filteredChannels.indexOf(row) : -1;
  const quickRow = channels.find((channel) => channel.id === quickId);
  const messages = parseMessages(row).filter(
    (message) =>
      !state.query.trim() ||
      message.text.toLowerCase().includes(state.query.toLowerCase()) ||
      row?.title.toLowerCase().includes(state.query.toLowerCase()),
  );
  const canSend =
    !!row &&
    canRecordAct(row, m, session) &&
    fieldAccess(m.id, "Message History", session) === "edit";
  const filtersActive = Boolean(
    state.query || state.visibility !== "All" || state.sort !== "Recent",
  );

  useEffect(() => {
    if (!row || state.selectedId === row.id) return;
    setState((current) => ({ ...current, selectedId: row.id }));
  }, [row, setState, state.selectedId]);

  useEffect(() => {
    if (mobileDetailOpen || !listRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = state.scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileDetailOpen, state.scrollTop]);

  useEffect(() => {
    if (!mobileReturnFocusRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (mobileDetailOpen) {
        mobileBackRef.current?.focus({ preventScroll: true });
        return;
      }
      selectedButtonRef.current?.focus({ preventScroll: true });
      mobileReturnFocusRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileDetailOpen]);

  function rememberScroll(event: UIEvent<HTMLDivElement>) {
    const scrollTop = event.currentTarget.scrollTop;
    setState((current) =>
      current.scrollTop === scrollTop ? current : { ...current, scrollTop },
    );
  }

  function selectChannel(id: string) {
    mobileReturnFocusRef.current = window.matchMedia("(max-width: 759px)").matches;
    setState((current) => ({ ...current, selectedId: id }));
    setRead((current) => [...new Set([...current, id])]);
    setDraft("");
    setError("");
    setQuickId("");
    setMobileDetailOpen(true);
  }

  function closeQuickInspection() {
    const activeQuickId = quickId;
    setQuickId("");
    requestAnimationFrame(() => {
      quickButtonRefs.current.get(activeQuickId)?.focus({ preventScroll: true });
    });
  }

  function openQuickConversation(id: string) {
    selectChannel(id);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 759px)").matches) {
        mobileBackRef.current?.focus({ preventScroll: true });
        return;
      }
      detailTitleRef.current?.focus({ preventScroll: true });
    });
  }

  function moveChannel(direction: number) {
    const target = filteredChannels[selectedIndex + direction];
    if (target) selectChannel(target.id);
  }

  function moveListFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home"
      ? 0
      : event.key === "End"
        ? filteredChannels.length - 1
        : Math.min(
            filteredChannels.length - 1,
            Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
          );
    channelButtonRefs.current
      .get(filteredChannels[target].id)
      ?.focus({ preventScroll: false });
  }

  function resetFilters() {
    setQuickId("");
    setState((current) => ({
      ...current,
      query: "",
      visibility: "All",
      sort: "Recent",
      scrollTop: 0,
    }));
  }

  function saveMessage() {
    if (!row || !canSend || !draft.trim()) return;
    let previous: Message[] = [];
    try {
      previous = JSON.parse(row.fields["Message History"] || "[]");
    } catch {
      previous = [];
    }
    if (
      mutate(
        row,
        {
          "Message History": JSON.stringify([
            ...previous,
            {
              id: String(Date.now()),
              actor: personFor(session),
              text: draft.trim(),
              time: new Date().toISOString(),
            },
          ]),
        },
        row.status,
        "Staff message saved locally",
      )
    ) {
      setDraft("");
      setError("");
    } else {
      setError(
        "The message was not saved. Your draft is still here; review access or reconnect and retry.",
      );
    }
  }

  return (
    <section
      className={`ci-workspace ${mobileDetailOpen ? "is-mobile-detail" : ""}`}
      aria-label="Authorized Conversation Workspace"
      data-record-interaction="communications-master-detail"
    >
      <p className="sr-only" aria-live="polite" data-conversation-list-status>
        {filteredChannels.length} authorized conversation{filteredChannels.length === 1 ? "" : "s"} visible.
        {row ? ` ${row.title} selected, ${selectedIndex + 1} of ${filteredChannels.length}.` : " No conversation selected."}
      </p>
      <section className="ci-master" aria-label="Conversation List">
        <header className="ci-master-header">
          <div><span className="p-kicker">AUTHORIZED CONVERSATIONS</span><h2>Staff Messaging</h2></div>
          <Badge>{filteredChannels.length} Visible</Badge>
        </header>
        <div className="ci-list-controls">
          <label className="ci-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search Staff Conversations</span><input aria-label="Search Staff Conversations" value={state.query} onChange={(event) => setState((current) => ({ ...current, query: event.target.value, scrollTop: 0 }))} placeholder="Find A Channel Or Message…" /></label>
          <label><span>State</span><select value={state.visibility} onChange={(event) => setState((current) => ({ ...current, visibility: event.target.value as ConversationState["visibility"], scrollTop: 0 }))}><option>All</option><option>Unread</option><option>Read</option></select></label>
          <label><span>Sort</span><select value={state.sort} onChange={(event) => setState((current) => ({ ...current, sort: event.target.value as ConversationState["sort"], scrollTop: 0 }))}><option>Recent</option><option>Title</option></select></label>
          {filtersActive && <button type="button" className="ci-reset-filters" onClick={resetFilters}><X size={15} aria-hidden="true" />Reset Filters</button>}
        </div>
        {quickRow && <QuickInspection row={quickRow} onClose={closeQuickInspection} onOpen={() => openQuickConversation(quickRow.id)} />}
        {!filteredChannels.length ? (
          <Empty title="No Assigned Conversations" message="No conversations match the current authorized scope and filters." />
        ) : (
          <div ref={listRef} className="ci-channel-list" aria-label="Authorized Conversations" onScroll={rememberScroll}>
            {filteredChannels.map((channel, index) => {
              const selected = channel.id === row?.id;
              return (
                <article key={channel.id} className={selected ? "is-selected" : ""}>
                  <button
                    ref={(element) => {
                      if (element) channelButtonRefs.current.set(channel.id, element);
                      else channelButtonRefs.current.delete(channel.id);
                      if (selected) selectedButtonRef.current = element;
                    }}
                    type="button"
                    className="ci-channel-select"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => selectChannel(channel.id)}
                    onKeyDown={(event) => moveListFocus(event, index)}
                  >
                    <MessageCircle size={18} />
                    <span><strong>{channel.fields.Channel || channel.title}</strong><small>{channel.company} · {channel.fields.Department || "Assigned Scope"}</small></span>
                    <Badge>{read.includes(channel.id) ? "Read" : "Unread"}</Badge>
                  </button>
                  <button ref={(element) => { if (element) quickButtonRefs.current.set(channel.id, element); else quickButtonRefs.current.delete(channel.id); }} type="button" className="ci-quick-button" onClick={() => setQuickId(channel.id)} aria-label={`Quick Inspect ${channel.title}`}><Eye size={15} />Quick Inspect</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="ci-detail" aria-label="Conversation Detail">
        {row ? (
          <>
            <header className="ci-detail-header">
              <button ref={mobileBackRef} type="button" className="ci-mobile-back" onClick={() => setMobileDetailOpen(false)}><ArrowLeft size={16} />Back To Conversation List</button>
              <div className="ci-detail-title"><div><span className="p-kicker">LOCAL STAFF CHANNEL · {row.id}</span><h2 ref={detailTitleRef} tabIndex={-1}>{row.fields.Channel || row.title}</h2><p>{row.company} · {row.fields.Department || "Assigned Scope"}</p></div><Badge>{read.includes(row.id) ? "Read" : "Unread"}</Badge></div>
              <div className="ci-detail-actions">
                <div className="ci-channel-pager" aria-label="Conversation Navigation">
                  <button type="button" onClick={() => moveChannel(-1)} disabled={selectedIndex <= 0} aria-label="Previous Conversation"><ArrowLeft size={16} /></button>
                  <span>{selectedIndex + 1} / {filteredChannels.length}</span>
                  <button type="button" onClick={() => moveChannel(1)} disabled={selectedIndex < 0 || selectedIndex >= filteredChannels.length - 1} aria-label="Next Conversation"><ArrowRight size={16} /></button>
                </div>
                <Btn variant="outline" onClick={() => open(row)}><Paperclip size={15} />Open Full Record<ArrowUpRight size={15} /></Btn>
              </div>
            </header>
            <div className="ci-presence"><span aria-hidden="true" />Local Demo · Live Presence Unavailable</div>
            <div className="ci-thread" aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={message.actor === personFor(session) ? "mine" : ""}>
                  <Avatar name={message.actor} />
                  <div><strong>{message.actor}</strong><p>{message.text}</p><small>{formatRecordDateTime12(message.time, session)}</small></div>
                </article>
              ))}
              {!messages.length && <Empty title="No Matching Messages" message="No messages in this authorized conversation match the current search." />}
            </div>
            <div className="ci-composer">
              {canSend ? (
                <form onSubmit={(event) => { event.preventDefault(); saveMessage(); }}>
                  <label className="p-field">Message<textarea aria-label="Staff Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write To This Assigned Channel…" maxLength={4000} /></label>
                  <div className="p-button-row"><Btn type="submit" disabled={!draft.trim()}><Send size={15} />Save Locally</Btn></div>
                  {error && <p role="alert">{error}</p>}
                </form>
              ) : (
                <p className="p-secondary">This conversation is read-only for your current access.</p>
              )}
              <small className="p-secondary">Messages and channel evidence share this record&apos;s access rules. No email, WhatsApp, SMS or external message is sent.</small>
            </div>
          </>
        ) : (
          <Empty title="Select A Conversation" message="Choose an authorized conversation to open its workspace." />
        )}
      </section>
    </section>
  );
}
export function NotificationCenter(){const{session,records,open}=useLab();const[q,setQ]=useState(''),[filter,setFilter]=useState('All'),[category,setCategory]=useState('All');const[read,setRead]=useDeviceState<string[]>('notifications-read-'+session.personId+'-'+session.company,[]),[ack,setAck]=useDeviceState<string[]>('notifications-ack-'+session.personId+'-'+session.company,[]);const rows=attentionRecords(records,session),key=(r:{module:string;id:string})=>r.module+':'+r.id;const visible=rows.filter(r=>(r.title+' '+r.status).toLowerCase().includes(q.toLowerCase())&&(filter!=='Unread'||!read.includes(key(r)))&&(filter!=='Acknowledged'||ack.includes(key(r)))&&(category==='All'||r.module===category));return <Panel title="Action & notification center" kicker="CURRENT AUTHORIZED FOLLOW-UPS"><div className="tech-calendar-tools"><input aria-label="Search notifications" value={q} onChange={e=>setQ(e.target.value)} placeholder="Find an action…"/><Pick label="Notification state" value={filter} onChange={setFilter} options={['All','Unread','Acknowledged']}/><Pick label="Notification category" value={category} onChange={setCategory} options={[{value:'All',label:'All workspaces'},...[...new Set(rows.map(r=>r.module))].map(id=>({value:id,label:byId(id)!.title}))]}/><Btn variant="outline" onClick={()=>setRead(r=>[...new Set([...r,...visible.map(key)])])}><CheckCheck size={15}/>Mark visible read</Btn></div><div className="tech-notifications">{visible.map(r=><article className={read.includes(key(r))?'read':''} key={key(r)}><div><Badge>{r.evidence.length?'Review':'Evidence required'}</Badge><small>{byId(r.module)?.title}</small><h3>{r.title}</h3><p>{r.status} · {r.owner}</p><small>{r.history.at(-1)?.time||r.due}</small></div><div><Btn variant="quiet" onClick={()=>{setRead(x=>[...new Set([...x,key(r)])]);open(r)}}>Open record<ArrowUpRight size={15}/></Btn><Btn variant="outline" disabled={ack.includes(key(r))} onClick={()=>{setAck(x=>[...new Set([...x,key(r)])]);setRead(x=>[...new Set([...x,key(r)])])}}>{ack.includes(key(r))?'Acknowledged':'Acknowledge locally'}</Btn></div></article>)}</div>{!visible.length&&<Empty title="No matching actions" message="There are no matching follow-ups in your current permissions."/>}</Panel>}
