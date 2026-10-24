import assert from 'node:assert/strict';
import { validNewSelectOptions, validSubmittedSelectAnswer } from '../worker/form-select-contract.ts';

assert.equal(validNewSelectOptions(['Pass','Fail','Not Applicable']),true);
for (const invalid of [[],['Only one'],['Pass','pass'],[' Pass','Fail'],['Pass','Pass'],['Pass',7],['x'.repeat(121),'Fail']]) assert.equal(validNewSelectOptions(invalid),false);
assert.equal(validSubmittedSelectAnswer('Pass',['Pass','Fail'],true),true);
for (const invalid of ['pass','Unknown',42,{},[],true]) assert.equal(validSubmittedSelectAnswer(invalid,['Pass','Fail'],true),false);
assert.equal(validSubmittedSelectAnswer('', ['Pass','Fail'],false),true);
assert.equal(validSubmittedSelectAnswer('', ['Pass','Fail'],true),false);
// Existing saved form choices, including a singleton, continue to accept exact matches.
assert.equal(validSubmittedSelectAnswer('Acknowledged',['Acknowledged'],true),true);
console.log('Approved form option runtime tests passed');
