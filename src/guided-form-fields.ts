import { validGuidedDependencies } from './guided-form-dependencies';

export type GuidedFormField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  showWhen?: { fieldKey: string; equals: string | boolean };
};

type FormPreset = {
  title: string;
  description: string;
  fields: GuidedFormField[];
};

export const FORM_OPTION_SETS = [
  { key: 'progress', label: 'Work Progress', choices: ['Not Started', 'In Progress', 'Completed', 'Not Applicable'] },
  { key: 'condition', label: 'Condition', choices: ['Good', 'Needs Attention', 'Unsafe', 'Not Applicable'] },
  { key: 'priority', label: 'Priority', choices: ['Low', 'Medium', 'High', 'Urgent'] },
  { key: 'result', label: 'Inspection Result', choices: ['Pass', 'Fail', 'Not Applicable'] },
  { key: 'yes_no', label: 'Yes / No / Not Applicable', choices: ['Yes', 'No', 'Not Applicable'] },
] as const;

export const FORM_PRESETS: Record<string, FormPreset> = {
  application: {
    title: 'Application Form',
    description: 'Collect information for an authorised application and review.',
    fields: [
      { key: 'application_type', label: 'Application Type', type: 'text', required: true },
      { key: 'application_details', label: 'Application Details', type: 'textarea', required: true },
    ],
  },
  daily_report: {
    title: 'Daily Work Report',
    description: 'Record daily work progress and matters requiring follow-up.',
    fields: [
      { key: 'work_progress', label: 'Work Progress', type: 'select', required: true, options: ['Not Started', 'In Progress', 'Completed', 'Not Applicable'] },
      { key: 'work_notes', label: 'Work Completed / Follow-Up', type: 'textarea', required: true },
    ],
  },
  inspection: {
    title: 'Inspection Checklist',
    description: 'Record inspection results and the condition of the inspected item.',
    fields: [
      { key: 'inspection_result', label: 'Inspection Result', type: 'select', required: true, options: ['Pass', 'Fail', 'Not Applicable'] },
      { key: 'asset_condition', label: 'Item Condition', type: 'select', required: true, options: ['Good', 'Needs Attention', 'Unsafe', 'Not Applicable'] },
      { key: 'inspection_notes', label: 'Findings / Corrective Actions', type: 'textarea' },
    ],
  },
  incident: {
    title: 'Incident Report',
    description: 'Record an incident and relevant facts for authorised review.',
    fields: [
      { key: 'incident_priority', label: 'Priority', type: 'select', required: true, options: ['Low', 'Medium', 'High', 'Urgent'] },
      { key: 'incident_details', label: 'Incident Details', type: 'textarea', required: true },
    ],
  },
  review: {
    title: 'Performance Review',
    description: 'Document performance observations and required follow-up.',
    fields: [
      { key: 'review_result', label: 'Review Outcome', type: 'select', required: true, options: ['Meets Expectations', 'Improvement Needed', 'Not Yet Assessed'] },
      { key: 'review_notes', label: 'Evidence / Comments', type: 'textarea' },
    ],
  },
  handover: {
    title: 'Shift Handover',
    description: 'Transfer outstanding actions and work status to the incoming team.',
    fields: [
      { key: 'handover_status', label: 'Handover Status', type: 'select', required: true, options: ['Completed', 'Outstanding Actions', 'Follow-Up Required'] },
      { key: 'handover_notes', label: 'Handover Notes', type: 'textarea', required: true },
    ],
  },
  acknowledgement: {
    title: 'Acknowledgement Form',
    description: 'Record an acknowledgement of the information provided.',
    fields: [
      { key: 'acknowledged', label: 'Acknowledgement', type: 'select', required: true, options: ['I Acknowledge', 'I Need Clarification'] },
    ],
  },
};

export function normaliseFormChoices(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    const value = line.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const dedupeKey = value.toLocaleLowerCase();
    if (value && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      result.push(value);
    }
  }
  return result;
}

export function prepareFormSchema(fields: GuidedFormField[], optionDrafts: Record<string, string>): GuidedFormField[] {
  if (fields.length === 0 || fields.length > 60) throw new Error('Add at least one field (maximum 60).');
  const keys = new Set<string>();
  const prepared = fields.map((field) => {
    const key = field.key;
    const label = field.label.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{1,50}$/.test(key) || keys.has(key)) throw new Error('A field key is invalid or duplicated.');
    keys.add(key);
    if (!label || label.length > 140) throw new Error('Each field needs a clear label (up to 140 characters).');
    if (field.type !== 'select') return { ...field, label, options: undefined };
    const raw = optionDrafts[key] ?? (field.options || []).join('\n');
    const choices = normaliseFormChoices(raw);
    if (choices.length < 2 || choices.length > 30 || choices.some((option) => option.length > 120)) {
      throw new Error(`${label}: provide 2–30 distinct dropdown choices, each at most 120 characters.`);
    }
    return { ...field, label, options: choices };
  });
  if (!validGuidedDependencies(prepared)) throw new Error('A conditional rule is invalid. Conditions must reference an earlier approved dropdown or Yes/No field with a valid answer.');
  return prepared;
}
