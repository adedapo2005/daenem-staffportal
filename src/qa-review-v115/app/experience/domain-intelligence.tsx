'use client';
import {useState} from 'react';
import {ArrowUpRight,Truck,Building2,Flame} from 'lucide-react';
import {useLab} from './lab-context';
import {RecordChart} from './analytics';
import {byId,canView,recordsFor,fieldAccess,money,type ModuleDef,type RecordData} from './model';
import {Panel,Btn,Metric,Badge,Pick,Timeline,Callout,RecordsTable,Bars,Empty} from './ui';
const numeric=(r:RecordData,k:string)=>k==='Occupancy'&&/^\d+ of \d+$/.test(r.fields[k]||'')?Number(r.fields[k].split(' ')[0]):r.fields[k]!==''&&r.fields[k]!==undefined&&Number.isFinite(Number(r.fields[k]))?Number(r.fields[k]):null;
export function FinancialDesk({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { session } = useLab();
  const [period, setPeriod] = useState("All source periods");
  const [kind, setKind] = useState("Bar");
  const periods = [
    ...new Set(
      rows
        .map((r) => r.fields["Fiscal Period"] || r.fields.Period)
        .filter(Boolean),
    ),
  ];
  const visible = rows.filter(
    (r) =>
      period === "All source periods" ||
      (r.fields["Fiscal Period"] || r.fields.Period) === period,
  );
  const journal = m.id === "finance";
  const spend = m.id === "spend";
  const debit = visible.reduce((n, r) => n + (numeric(r, "Debit") || 0), 0);
  const credit = visible.reduce(
    (n, r) => n + (numeric(r, "Credit") || 0),
    0,
  );
  const unbalanced = visible.filter(
    (r) => numeric(r, "Debit") !== numeric(r, "Credit"),
  );
  const financial =
    fieldAccess(m.id, journal ? "Debit" : "Amount", session) !== "hidden";

  return (
    <>
      <div className="p-finance-toolbar">
        <Pick
          label="Source financial period"
          value={period}
          onChange={setPeriod}
          options={["All source periods", ...periods]}
        />
        <Badge>NGN · records you can view</Badge>
      </div>
      <div className="p-finance-ribbon">
        {financial && (
          <>
            <Metric
              label={journal ? "Journal debits" : "Recorded value"}
              value={money(
                journal
                  ? debit
                  : visible.reduce((n, r) => n + r.amount, 0),
              )}
            />
            {journal && (
              <>
                <span>−</span>
                <Metric label="Journal credits" value={money(credit)} />
                <span>=</span>
                <Metric
                  label="Posting difference"
                  value={money(debit - credit)}
                />
              </>
            )}
          </>
        )}
        <Metric
          label="Evidence gaps"
          value={String(visible.filter((r) => !r.evidence.length).length)}
        />
      </div>
      <div className="p-two">
        <Panel
          title={journal ? "Journal lifecycle" : "Recorded value distribution"}
          kicker="SELECT A GROUP TO REVIEW"
          action={
            <Pick
              label="Financial chart"
              value={kind}
              onChange={setKind}
              options={["Bar", "Horizontal bar", "Donut", "Treemap"]}
            />
          }
        >
          <RecordChart
            rows={visible}
            kind={kind}
            metric={journal ? "record-count" : "record-value"}
            onSelect={(r) => r[0] && open(r[0])}
          />
        </Panel>
        {spend ? (
          <Panel title="Payment & reconciliation" kicker="RECORDED SPEND">
            <Callout
              tone="neutral"
              title="Recorded spend is not confirmed payment"
            >
              An approved or recorded expense does not confirm that money left
              a bank account. Payment, refund, reversal and reconciliation
              details appear only when they are supplied by the payment record.
            </Callout>
            <dl className="p-detail-fields single">
              <div>
                <dt>Records in this view</dt>
                <dd>{visible.length}</dd>
              </div>
              <div>
                <dt>Payment confirmation</dt>
                <dd>Not available in this review</dd>
              </div>
            </dl>
          </Panel>
        ) : (
          <Panel
            title={
              journal ? "Posting control" : "How these figures were calculated"
            }
          >
            <div
              className="tech-stat-ring"
              style={
                {
                  "--progress":
                    (visible.length
                      ? ((visible.length - unbalanced.length) / visible.length) *
                        100
                      : 0) + "%",
                } as React.CSSProperties
              }
            >
              <strong>
                {visible.length - unbalanced.length}/{visible.length}
              </strong>
              <small>{journal ? "balanced journals" : "records used"}</small>
            </div>
            <Callout
              tone="neutral"
              title={
                journal
                  ? "Posting requires an explicitly Open period"
                  : "Figures use only records you can view"
              }
            >
              {journal
                ? "Debit and credit must reconcile; a missing or unknown period cannot be posted. Journal turnover is not presented as a bank balance."
                : "If an opening balance or forecast is not available, it is not shown or estimated."}
            </Callout>
            <Timeline
              items={visible.slice(0, 3).map((r) => ({
                action: r.title,
                actor: r.owner,
                time: r.status,
              }))}
            />
          </Panel>
        )}
      </div>
      <RecordsTable
        rows={visible}
        onOpen={open}
        financial
        title={m.title + " records used"}
      />
    </>
  );
}
export function BakeryDesk({rows,open}:{rows:RecordData[];open:(r:RecordData)=>void}){const{session,go}=useLab();const[selected,setSelected]=useState(rows[0]?.id||'');const row=rows.find(r=>r.id===selected)||rows[0];if(!row)return <Empty title="No authorized batches"/>;const expected=numeric(row,'Expected Yield'),actual=numeric(row,'Actual Yield'),waste=numeric(row,'Waste');const total=rows.reduce((s,r)=>s+(numeric(r,'Expected Yield')||0),0);return <><div className="p-bakery-top"><div><span className="p-kicker">BAKERY / BATCH CONTROL</span><h2>Every batch has an accountable yield.</h2><p>Planning, actual output, QC and dispatch follow the same production record.</p></div><Metric label="Planned units" value={String(total)} detail="Sum of recorded expected yields"/><Metric label="Missing actual yield" value={String(rows.filter(r=>numeric(r,'Actual Yield')===null).length)}/></div><div className="p-bakery-layout"><Panel title="Production flow"><div className="tech-batch-flow">{rows.map(r=><button key={r.id} className={r.id===row.id?'selected':''} onClick={()=>setSelected(r.id)}><Flame size={24}/><span><strong>{r.title}</strong><small>{r.fields.Recipe} · {r.fields.Oven}</small></span><Badge>{r.status}</Badge></button>)}</div><div className="p-button-row">{['bakery-recipes','bakery-accountability','bakery-sales'].filter(id=>canView(byId(id),session)).map(id=><Btn variant="outline" key={id} onClick={()=>go(id)}>{byId(id)!.title}</Btn>)}</div></Panel><Panel title="Selected batch reconciliation" kicker={row.id}><Metric label="Recorded yield / expected" value={actual===null?'Awaiting actual yield':expected?Math.round(actual/expected*100)+'%':String(actual)} detail={row.title}/><Bars unit=" units" items={[{label:'Expected',value:expected||0,max:Math.max(expected||0,actual||0,1)},{label:'Actual',value:actual||0,max:Math.max(expected||0,actual||0,1)},{label:'Waste',value:waste||0,max:Math.max(expected||0,actual||0,1)}]}/>{actual===null&&<Callout title="Actual yield is still missing">An expected yield is never substituted for recorded production.</Callout>}<Btn onClick={()=>open(row)}>Review batch & handoff<ArrowUpRight size={15}/></Btn></Panel></div><Panel title="Batch event history"><Timeline items={row.history}/></Panel></>}
export function LogisticsDesk({rows,open}:{rows:RecordData[];open:(r:RecordData)=>void}){const{session,go}=useLab();const[selected,setSelected]=useState(rows[0]?.id||'');const row=rows.find(r=>r.id===selected)||rows[0];if(!row)return <Empty title="No authorized trips"/>;return <><div className="p-dispatch-bar"><div><Badge>Record-driven dispatch</Badge><h2>From assignment to accountable delivery.</h2></div><div className="p-button-row">{['fleet','trip-costs'].filter(id=>canView(byId(id),session)).map(id=><Btn key={id} variant="outline" onClick={()=>go(id)}>{byId(id)!.title}</Btn>)}</div></div><div className="p-dispatch-layout"><Panel title="Selected journey" kicker={row.id}><div className="tech-route"><div><span>ORIGIN</span><strong>{row.fields.Origin||'Not recorded'}</strong></div><div className="tech-route-line"><Truck size={27}/></div><div><span>DESTINATION</span><strong>{row.fields.Destination||'Not recorded'}</strong></div></div><div className="p-selected-trip"><div><h2>{row.title}</h2><p>{row.fields.Driver} · {row.fields.Vehicle}</p></div><Badge>{row.status}</Badge></div><Callout tone="neutral" title="Location source unavailable">This is a journey schematic from the record. No live GPS position, speed or route progress is invented.</Callout><Btn onClick={()=>open(row)}>Inspect trip & delivery evidence</Btn></Panel><Panel title="Dispatch queue"><div className="p-dispatch-queue">{rows.map(r=><button key={r.id} className={r.id===row.id?'selected':''} onClick={()=>setSelected(r.id)}><h3>{r.title}</h3><Badge>{r.status}</Badge><small>{r.fields.Driver} · {r.fields.Vehicle}</small></button>)}</div></Panel></div><div className="p-two"><Panel title="Source event timeline"><Timeline items={row.history}/></Panel><Panel title="Delivery readiness"><Metric label="Delivery proof" value={row.evidence.length&&row.fields['Proof of Delivery']?'Attached':'Required'}/><p>Delivery and closure require recorded proof. Trip reconciliation starts from the same delivered source.</p><RecordChart rows={rows} kind="Donut" onSelect={r=>r[0]&&open(r[0])}/></Panel></div></>}
export function PropertyDesk({rows,open}:{rows:RecordData[];open:(r:RecordData)=>void}){const{session,records,go}=useLab();const leases=recordsFor(records,byId('leases')!,session),known=rows.every(r=>numeric(r,'Units')!==null&&numeric(r,'Occupancy')!==null);const total=rows.reduce((n,r)=>n+(numeric(r,'Units')||0),0),occupied=rows.reduce((n,r)=>n+(numeric(r,'Occupancy')||0),0);return <><div className="p-property-banner"><div><span className="p-kicker">PROPERTY PORTFOLIO</span><h2>Space, occupancy and obligations.</h2><p>Portfolio values derive from authorized property records.</p></div><Metric label="Recorded occupancy" value={known&&total?Math.round(occupied/total*100)+'%':'Not fully recorded'} detail={known?occupied+' of '+total+' units':'Complete unit and occupancy fields'}/><Metric label="Authorized leases" value={String(leases.length)}/></div><div className="p-property-grid">{rows.map((r,i)=>{const units=numeric(r,'Units'),used=numeric(r,'Occupancy');return <Panel key={r.id} className="p-property-card"><div className={'p-property-id property-'+i}><Building2 size={40}/><strong>{r.title}</strong><Badge>{r.status}</Badge></div><h2>{r.fields.Property||r.title}</h2><div className="p-two"><Metric label="Units" value={units===null?'Unrecorded':String(units)}/><Metric label="Occupied units" value={used===null?'Unrecorded':String(used)}/></div>{units!==null&&used!==null&&units<=100&&<div className="p-unit-grid" aria-label="Aggregate occupancy illustration, not individual unit assignments">{Array.from({length:units},(_,i)=><span key={i} className={i>=used?'vacant':''} title={i<used?'Occupied aggregate':'Available aggregate'}>{String(i+1).padStart(2,'0')}</span>)}</div>}<Btn variant="outline" onClick={()=>open(r)}>Inspect property</Btn></Panel>})}</div><div className="p-two"><Panel title="Lease obligations"><Timeline items={leases.map(r=>({action:r.title,actor:r.fields.Tenant,time:r.fields['Lease End']||r.due}))}/>{canView(byId('leases'),session)&&<Btn onClick={()=>go('leases')}>Open lease schedules</Btn>}</Panel><Panel title="Property states"><RecordChart rows={rows} kind="Donut" onSelect={r=>r[0]&&open(r[0])}/></Panel></div></>}
