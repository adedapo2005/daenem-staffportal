export type ConstructionRole='Super Admin'|'Organization Owner'|'Finance Manager'|'Project Manager'|'Procurement Manager'|'Quantity Surveyor'|'Inventory Manager'|'Site Supervisor'|'Contractor'|'Artisan'|'Auditor'|'Viewer';
export const constructionRoles:ConstructionRole[]=['Super Admin','Organization Owner','Finance Manager','Project Manager','Procurement Manager','Quantity Surveyor','Inventory Manager','Site Supervisor','Contractor','Artisan','Auditor','Viewer'];
export const constructionScopes=['Organization','Project','Building','Area','Record','Field','Action'] as const;
export const constructionRoleMatrix=[
 {role:'Organization Owner',scope:'Organization',access:'Portfolio, cash, approvals, reports'},
 {role:'Finance Manager',scope:'Organization · Project',access:'Budget, payments, reconciliation'},
 {role:'Project Manager',scope:'Assigned Project',access:'Delivery, work, progress, issues'},
 {role:'Quantity Surveyor',scope:'Assigned Project · Building',access:'BOQ, variance, valuation'},
 {role:'Site Supervisor',scope:'Assigned Building · Area',access:'Consumption, progress, inspections'},
 {role:'Contractor / Artisan',scope:'Assigned Work Order only',access:'Own work, evidence, status'},
 {role:'Auditor',scope:'Assigned Organization · Project',access:'Read, evidence and immutable history'},
];

export const projects=[
 {id:'PRJ-2601',name:'Akọ́bí Residential Development',company:'Daenem Group',location:'Ibadan, Nigeria',manager:'Aminat Bello',status:'Active',budget:1850000000,spent:742600000,committed:218400000,progress:46,forecast:1914000000,cash:306800000,start:'15 Jan 2026',finish:'28 Feb 2028'},
 {id:'PRJ-2602',name:'Apata Technology Campus',company:'Daenem Group',location:'Ibadan, Nigeria',manager:'Tunde Okafor',status:'Mobilizing',budget:960000000,spent:118500000,committed:96500000,progress:18,forecast:948000000,cash:184000000,start:'04 May 2026',finish:'30 Nov 2027'},
 {id:'PRJ-2507',name:'Oke-Ado Logistics Yard',company:'Daenem Logistics',location:'Oyo State, Nigeria',manager:'Kemi Adeyemi',status:'Active',budget:620000000,spent:401200000,committed:51800000,progress:73,forecast:634500000,cash:92500000,start:'10 Sep 2025',finish:'20 Dec 2026'},
];
export const buildings=[
 {id:'BLD-A',project:'PRJ-2601',name:'Building A · North Court',budget:610000000,spent:286400000,progress:55,stage:'Structure',areas:4,issues:2},
 {id:'BLD-B',project:'PRJ-2601',name:'Building B · South Court',budget:548000000,spent:221900000,progress:43,stage:'Structure',areas:5,issues:3},
 {id:'BLD-C',project:'PRJ-2601',name:'Shared Services Pavilion',budget:252000000,spent:75400000,progress:31,stage:'Services',areas:3,issues:1},
 {id:'BLD-T1',project:'PRJ-2602',name:'Technology Block',budget:520000000,spent:73400000,progress:17,stage:'Foundation',areas:6,issues:2},
];
export const areas=[
 {id:'AREA-A-GF',building:'BLD-A',project:'PRJ-2601',name:'Ground Floor',package:'Concrete Frame',budget:124000000,spent:81700000,progress:72,status:'In Progress',lead:'Segun Martins'},
 {id:'AREA-A-L1',building:'BLD-A',project:'PRJ-2601',name:'Level One',package:'Blockwork',budget:86400000,spent:36200000,progress:48,status:'In Progress',lead:'Ngozi Eze'},
 {id:'AREA-B-GF',building:'BLD-B',project:'PRJ-2601',name:'Ground Floor',package:'MEP First Fix',budget:94400000,spent:24700000,progress:28,status:'Ready',lead:'Bayo Salami'},
 {id:'AREA-T-EXT',building:'BLD-T1',project:'PRJ-2602',name:'External Works',package:'Drainage & Access',budget:68000000,spent:15600000,progress:25,status:'In Progress',lead:'Tosin Ajayi'},
];
export const boq=[
 {id:'BOQ-001',project:'PRJ-2601',building:'BLD-A',area:'AREA-A-GF',type:'Material',item:'Portland Cement',unit:'Bag',estimatedQty:4200,actualQty:4380,estimatedRate:7100,actualRate:7350},
 {id:'BOQ-002',project:'PRJ-2601',building:'BLD-A',area:'AREA-A-GF',type:'Material',item:'16 mm Iron Rod',unit:'Length',estimatedQty:1850,actualQty:1770,estimatedRate:12750,actualRate:13100},
 {id:'BOQ-003',project:'PRJ-2601',building:'BLD-A',area:'AREA-A-L1',type:'Labour',item:'Blockwork Labour',unit:'m²',estimatedQty:2780,actualQty:2210,estimatedRate:3500,actualRate:3650},
 {id:'BOQ-004',project:'PRJ-2602',building:'BLD-T1',area:'AREA-T-EXT',type:'Equipment',item:'Excavator Hire',unit:'Day',estimatedQty:18,actualQty:21,estimatedRate:280000,actualRate:280000},
];
export const boqVariance=(r:typeof boq[number])=>{const estimated=r.estimatedQty*r.estimatedRate,actual=r.actualQty*r.actualRate;return{estimated,actual,quantity:r.actualQty-r.estimatedQty,rate:r.actualRate-r.estimatedRate,cost:actual-estimated,remaining:Math.max(0,r.estimatedQty-r.actualQty)}};

export const materials=[
 {id:'MAT-CEM-001',name:'Portland Cement',sku:'CEM-42.5R',variant:'42.5R',unit:'Bag',category:'Cement',receipts:6200,issues:4380,transfersIn:0,transfersOut:120,returns:80,damage:12,waste:34,adjustment:0,reserved:420,minimum:700,unitCost:7350,lastCost:7480},
 {id:'MAT-ROD-016',name:'Iron Rod',sku:'ROD-016',variant:'16 mm',unit:'Length',category:'Steel',receipts:2600,issues:1770,transfersIn:120,transfersOut:0,returns:40,damage:3,waste:17,adjustment:-5,reserved:310,minimum:400,unitCost:13100,lastCost:13450},
 {id:'MAT-TIM-212',name:'Timber',sku:'TIM-2X12',variant:'2×12',unit:'Length',category:'Timber',receipts:1850,issues:940,transfersIn:0,transfersOut:110,returns:35,damage:24,waste:51,adjustment:0,reserved:280,minimum:300,unitCost:5100,lastCost:5250},
 {id:'MAT-BLK-150',name:'Sandcrete Block',sku:'BLK-150',variant:'150 mm',unit:'Each',category:'Blocks',receipts:18400,issues:14620,transfersIn:0,transfersOut:0,returns:260,damage:172,waste:188,adjustment:0,reserved:1900,minimum:2500,unitCost:620,lastCost:640},
];
export const materialBalance=(m:typeof materials[number])=>m.receipts+m.transfersIn+m.returns+m.adjustment-m.issues-m.transfersOut-m.damage-m.waste;
export const workOrders=[
 {id:'WO-2609-018',project:'PRJ-2601',building:'BLD-A',area:'AREA-A-L1',description:'Complete north-wing blockwork',assignee:'Adekunle Masonry Services',team:'Bricklayers · 8',start:'08 Sep',end:'24 Sep',value:12800000,status:'In Progress',progress:62,evidence:4},
 {id:'WO-2609-021',project:'PRJ-2601',building:'BLD-B',area:'Ground Floor',description:'MEP containment first fix',assignee:'Voltline Engineering',team:'Electrical · 5',start:'11 Sep',end:'30 Sep',value:18950000,status:'Inspection',progress:81,evidence:7},
 {id:'WO-2609-026',project:'PRJ-2602',building:'BLD-T1',area:'AREA-T-EXT',description:'Construct eastern drainage channel',assignee:'Tosin Ajayi',team:'Civil · 6',start:'12 Sep',end:'05 Oct',value:9600000,status:'Assigned',progress:12,evidence:2},
];
export const contracts=[
 {id:'CTR-2601-014',project:'PRJ-2601',name:'Building A Structural Works',contractor:'PrimeForm Nigeria',original:146000000,variation:8400000,retention:7720000,paid:92400000,milestones:'3 / 5',status:'Active'},
 {id:'CTR-2601-019',project:'PRJ-2601',name:'Electrical First Fix',contractor:'Voltline Engineering',original:46500000,variation:0,retention:2325000,paid:18600000,milestones:'1 / 4',status:'Active'},
 {id:'CTR-2602-004',project:'PRJ-2602',name:'External Drainage',contractor:'Tosin Ajayi',original:23800000,variation:1800000,retention:1280000,paid:6400000,milestones:'1 / 3',status:'Review'},
];
export const payments=[
 {id:'PAY-2609-117',project:'PRJ-2601',building:'BLD-A',area:'AREA-A-L1',payee:'PrimeForm Nigeria',source:'CTR-2601-014 · Milestone 3',amount:18400000,status:'Approval',maker:'Kemi Adeyemi',checker:'Aminat Bello',budget:'PASS',risk:'LOW',reference:'Pending'},
 {id:'PAY-2609-118',project:'PRJ-2601',building:'BLD-B',area:'Ground Floor',payee:'Voltline Engineering',source:'WO-2609-021',amount:9250000,status:'Risk Review',maker:'Tunde Okafor',checker:'Unassigned',budget:'PASS',risk:'REVIEW',reference:'Pending'},
 {id:'PAY-2609-103',project:'PRJ-2602',building:'BLD-T1',area:'AREA-T-EXT',payee:'Tosin Ajayi',source:'CTR-2602-004 · Milestone 1',amount:6400000,status:'Reconciled',maker:'Kemi Adeyemi',checker:'Aminat Bello',budget:'PASS',risk:'LOW',reference:'SIM-820014'},
];
export const bankMatches=[
 {id:'BNK-884102',time:'12 Sep · 10:42 AM',direction:'OUT',amount:6400000,description:'Tosin Ajayi',payment:'PAY-2609-103',work:'CTR-2602-004',project:'PRJ-2602',state:'Reconciled',variance:0,channel:'File Import'},
 {id:'BNK-884116',time:'12 Sep · 11:08 AM',direction:'OUT',amount:9250000,description:'VOLTLINE ENG',payment:'PAY-2609-118',work:'WO-2609-021',project:'PRJ-2601',state:'Suggested',variance:0,channel:'CSV Statement'},
 {id:'BNK-884140',time:'12 Sep · 1:16 PM',direction:'OUT',amount:36800000,description:'PRIMEFORM NIG',payment:'No match',work:'CTR-2601-014',project:'PRJ-2601',state:'Exception',variance:18400000,channel:'PDF Statement'},
];
export const riskSignals=[
 {id:'RSK-027',severity:'HIGH',type:'Potential duplicate payment',source:'PAY-2609-117 / BNK-884140',project:'PRJ-2601',detail:'Same contract milestone and amount pattern appears twice within 36 hours.',status:'Investigating',owner:'Finance Control'},
 {id:'RSK-031',severity:'MEDIUM',type:'BOQ over-consumption',source:'BOQ-001',project:'PRJ-2601',detail:'Cement quantity is 180 bags above approved estimate; rate variance also exists.',status:'Evidence Review',owner:'Quantity Surveyor'},
 {id:'RSK-035',severity:'MEDIUM',type:'Supplier bank change',source:'SUP-1048',project:'PRJ-2602',detail:'Beneficiary details changed before an open payment request.',status:'Signal',owner:'Procurement Control'},
];
export const whatsappProposals=[
 {id:'COM-7712',conversation:'Site Supervisors · Building A',message:'We need another 120 bags of cement for the north wing tomorrow.',type:'Material Request',link:'PRJ-2601 · BLD-A · AREA-A-L1',confidence:'92%',status:'Proposed'},
 {id:'COM-7724',conversation:'Voltline Engineering',message:'First fix on the ground floor is ready for inspection. Seven photos attached.',type:'Progress Update',link:'WO-2609-021',confidence:'96%',status:'Reviewed'},
 {id:'COM-7730',conversation:'PrimeForm Nigeria',message:'Milestone three invoice submitted against the structural contract.',type:'Payment Request',link:'CTR-2601-014',confidence:'89%',status:'Confirmed'},
];
export const constructionReports=['Executive Project Report','Budget vs Actual','Forecast At Completion','BOQ Variance','Material Consumption','Waste','Inventory Valuation','Supplier Spend','Contractor Spend','Artisan Payments','Workmanship Cost','Materials Cost','Cash Flow','Bank Reconciliation','Pending Payments','Procurement Status','Site Progress','Building Performance','Area Performance','Fraud / Risk Alerts','Outstanding Contracts','Retention','Project Cost Intelligence'];
export const paymentStages=['Payment Request','AI Advisory Review','Fraud / Risk Check','Budget Check','Contract / PO / Work Order Check','Approval Chain','Ready For Execution','Provider Submission Simulation','Processing','Success / Failure / Reversal','Receipt','Reconciliation','Audit'];
export const providerModes=[{institution:'GTBank',mode:'Unknown / Future'},{institution:'Access Bank',mode:'File Import'},{institution:'UBA',mode:'Unknown / Future'},{institution:'Zenith Bank',mode:'File Import'},{institution:'First Bank',mode:'Unknown / Future'},{institution:'Moniepoint',mode:'File Import'},{institution:'OPay',mode:'File Import'},{institution:'Wema Bank',mode:'Unknown / Future'},{institution:'Kuda Business',mode:'Requires Provider Confirmation'}];
