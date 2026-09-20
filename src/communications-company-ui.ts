export type CommunicationCompanyUi={label:string;shortLabel:string;uiKey:string;monogram:string;descriptor:string};

export const COMMUNICATION_COMPANY_UI:Record<string,CommunicationCompanyUi>={
  'company-autos':{label:'Daenem Autos',shortLabel:'Autos',uiKey:'autos',monogram:'AU',descriptor:'Automotive sales, service & customer care'},
  'company-bakery':{label:'Daenem Bakery',shortLabel:'Bakery',uiKey:'bakery',monogram:'BK',descriptor:'Orders, fulfilment & customer care'},
  'company-properties':{label:'Daenem Homes & Properties',shortLabel:'Homes & Properties',uiKey:'properties',monogram:'HP',descriptor:'Property enquiries, sales & resident support'},
  'company-logistics':{label:'Daenem Logistics',shortLabel:'Logistics',uiKey:'logistics',monogram:'LG',descriptor:'Delivery, transport & shipment support'},
  'company-printing':{label:'Daenem Printing & Technology',shortLabel:'Printing & Technology',uiKey:'printing',monogram:'PT',descriptor:'Printing, technology & project support'},
};

export function resolveCommunicationCompanyUi(company:{id:string;code:string;name:string}):CommunicationCompanyUi{
  return COMMUNICATION_COMPANY_UI[company.id]||{
    label:company.name,
    shortLabel:company.name.replace(/^Daenem\s+/i,''),
    uiKey:company.code||company.id,
    monogram:(company.code||company.name).replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase()||'DA',
    descriptor:'DAENEM company customer communications',
  };
}
