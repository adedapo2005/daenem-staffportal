import type {RecordData} from './model';

interface ConfiguredFormField {
    id: string;
    prefill: string;
    defaultValue: string;
}

const controlledFields = new Set([
    'Assigned To',
    'Audience',
    'Category',
    'Channel',
    'Company',
    'Cost Centre',
    'Department',
    'Employee',
    'Employment Type',
    'Leave Type',
    'Location',
    'Manager',
    'Priority',
    'Requester',
    'Supplier',
]);

const unique = (values: Array<string | undefined>) => [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];

export function buildAuthorizedFieldOptions(fields:string[],row:RecordData,authorizedRows:RecordData[],known:Record<string,string>) {
    return Object.fromEntries(fields.filter(field => controlledFields.has(field)).map(field => [
        field,
        unique([known[field],row.fields[field],...authorizedRows.map(record => record.fields[field])]),
    ]).filter(([,options]) => options.length)) as Record<string,string[]>;
}

export function buildRecordPrefill(fields:string[],row:RecordData,known:Record<string,string>,today:string) {
    return Object.fromEntries(fields.map(field => [
        field,
        row.fields[field] || known[field] || (/^(Request Date|Date)$/.test(field) ? today : ''),
    ]));
}

export function prefillOrigin(field:string,value:string,row:RecordData,known:Record<string,string>) {
    if (!value || row.fields[field]) return '';
    if (known[field] === value) return 'Authorized Context';
    if (/^(Request Date|Date)$/.test(field)) return 'Current Date';
    return '';
}

export function buildConfiguredFormValues(fields:ConfiguredFormField[],mappedContext:Record<string,string>) {
    return Object.fromEntries(fields.map(field => [
        field.id,
        mappedContext[field.prefill] || field.defaultValue || '',
    ]));
}

export function configuredPrefillOrigin(field:ConfiguredFormField,value:string,mappedContext:Record<string,string>) {
    return value && mappedContext[field.prefill] === value ? field.prefill : '';
}
