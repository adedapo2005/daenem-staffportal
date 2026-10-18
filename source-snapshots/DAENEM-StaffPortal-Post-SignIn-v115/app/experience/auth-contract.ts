/** Local design-lab contracts. Production values must be mapped, never inferred. */
export const productionContractStatus = 'PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION';
export interface PasswordPolicy {
  minimumLength: number;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
  preventImmediateReuse: boolean;
}
export const fixturePasswordPolicy: PasswordPolicy = {
  minimumLength: 10, uppercase: true, lowercase: true, number: true,
  symbol: true, preventImmediateReuse: true,
};
export function passwordRequirements(value: string, policy: PasswordPolicy) {
  return [
    { id: 'length', label: `${policy.minimumLength} or more characters`, valid: value.length >= policy.minimumLength, enabled: true },
    { id: 'uppercase', label: 'An uppercase letter', valid: /[A-Z]/.test(value), enabled: policy.uppercase },
    { id: 'lowercase', label: 'A lowercase letter', valid: /[a-z]/.test(value), enabled: policy.lowercase },
    { id: 'number', label: 'A number', valid: /[0-9]/.test(value), enabled: policy.number },
    { id: 'symbol', label: 'A symbol', valid: /[^A-Za-z0-9\s]/.test(value), enabled: policy.symbol },
  ].filter(rule => rule.enabled);
}
export function passwordError(value: string, confirm: string, policy: PasswordPolicy, previous?: string) {
  if (passwordRequirements(value, policy).some(rule => !rule.valid)) return 'Meet each password requirement before continuing.';
  if (value !== confirm) return 'The passwords do not match.';
  if (policy.preventImmediateReuse && previous && value === previous) return 'Choose a password different from the previous password.';
  return null;
}
export type CodeState = { attempts: number; expiresAt: number; nextResendAt: number; verified: boolean; resetExpiresAt?: number };
export const issueDemoCode = (now: number): CodeState => ({ attempts: 0, expiresAt: now + 120000, nextResendAt: now + 30000, verified: false });
export function verifyDemoCode(code: string, state: CodeState, now: number): { state: CodeState; error: string | null } {
  if (state.attempts >= 3) return { state, error: 'Verification is temporarily locked. Request a new code after the cooldown.' };
  if (now >= state.expiresAt) return { state, error: 'This verification code has expired. Request a new code.' };
  if (code !== '246810') return { state: { ...state, attempts: state.attempts + 1 }, error: 'The verification code could not be verified.' };
  return { state: { ...state, verified: true, resetExpiresAt: now + 300000 }, error: null };
}
export function canResetPassword(state: CodeState, now: number) { return state.verified && !!state.resetExpiresAt && now < state.resetExpiresAt; }
export const authenticationScenarios = [
  'Normal sign-in', 'Invalid credentials', 'Locked account', 'Rate limited',
  'Temporary password', 'Expired temporary password', 'Recovery', 'Expired code',
  'Session expired', 'Account unavailable', 'Network unavailable',
  'Location required', 'Outside geofence', 'Employee activation', 'Provisional account',
];

export interface SignInPreset { id: string; name: string; composition: string; image: string; nativeFile:string; focalPoint: string; night: boolean; city: string; description: string; credit: string; source: string; license: string; nativeWidth:number; nativeHeight:number }
export const signInPresets: SignInPreset[] = [
 {id:'horizon',name:'Nigerian Horizon',composition:'horizon',image:'/assets/scenery/nigeria-ibadan-senate.jpg',nativeFile:'design-assets/signin-native/nigeria-ibadan-senate.jpg',focalPoint:'50% 48%',night:false,city:'Ibadan, Nigeria · university civic architecture',description:'Nigerian-founded horizon with global operational context. Illustrative setting; not a Daenem facility.',credit:'S.aderogba / Wikimedia Commons',source:'https://commons.wikimedia.org/wiki/File:Senate-building-university-of-ibadan-2.jpg',license:'https://creativecommons.org/licenses/by-sa/4.0/',nativeWidth:5760,nativeHeight:3840},
 {id:'editorial',name:'The Architecture Edit',composition:'editorial',image:'/assets/scenery/03-shanghai-glass.jpg',nativeFile:'design-assets/signin-native/03-shanghai-glass.jpg',focalPoint:'62% 48%',night:false,city:'Shanghai, China · modern architecture',description:'An editorial technology composition with disciplined white and blue geometry.',credit:'Declan Sun / Unsplash',source:'https://unsplash.com/photos/modern-glass-building-against-a-clear-blue-sky-LdLxQxpU6k8',license:'https://unsplash.com/license',nativeWidth:9313,nativeHeight:6336},
 {id:'nightfall',name:'Global Night Operations',composition:'nightfall',image:'/assets/scenery/05-singapore-blue-hour.jpg',nativeFile:'design-assets/signin-native/05-singapore-blue-hour.jpg',focalPoint:'45% 50%',night:true,city:'Singapore · blue-hour city panorama',description:'A global operations panorama with controlled night illumination.',credit:'Wesley Pribadi / Unsplash',source:'https://unsplash.com/photos/singapores-skyline-at-night-is-beautiful-cnHUiuAolpg',license:'https://unsplash.com/license',nativeWidth:13578,nativeHeight:5212},
 {id:'atrium',name:'Executive Atrium',composition:'atrium',image:'/assets/scenery/04-white-atrium.jpg',nativeFile:'design-assets/signin-native/04-white-atrium.jpg',focalPoint:'50% 35%',night:false,city:'Washington, DC · architectural atrium',description:'Light-filled vertical architecture for a precise executive entrance.',credit:'Intricate Explorer / Unsplash',source:'https://unsplash.com/photos/modern-hotel-atrium-with-glass-ceiling-and-balconies-soVJrlvGRk0',license:'https://unsplash.com/license',nativeWidth:6336,nativeHeight:9504},
 {id:'vertical',name:'Metropolitan Systems',composition:'vertical',image:'/assets/scenery/02-pudong-glass.jpg',nativeFile:'design-assets/signin-native/02-pudong-glass.jpg',focalPoint:'50% 44%',night:false,city:'Shanghai, China · executive glass architecture',description:'Stacked glass volumes frame a vertically balanced enterprise system.',credit:'Declan Sun / Unsplash',source:'https://unsplash.com/photos/modern-glass-building-against-a-clear-blue-sky-MFHkVKYhWxE',license:'https://unsplash.com/license',nativeWidth:7110,nativeHeight:5814},
 {id:'panorama',name:'Lagos Motion',composition:'panorama',image:'/assets/scenery/lagos-bridge-drive.jpg',nativeFile:'design-assets/signin-native/lagos-bridge-drive.jpg',focalPoint:'52% 50%',night:false,city:'Lagos, Nigeria · urban bridge movement',description:'A Nigerian urban panorama expressing movement, infrastructure and ambition.',credit:'Ben Iwara / Unsplash',source:'https://unsplash.com/photos/ri22VY7Cm8U',license:'https://unsplash.com/license',nativeWidth:6637,nativeHeight:4425},
 {id:'duet',name:'A Shared Perspective',composition:'duet',image:'/assets/scenery/01-manhattan-day.jpg',nativeFile:'design-assets/signin-native/01-manhattan-day.jpg',focalPoint:'50% 42%',night:false,city:'New York, United States · global skyline',description:'A daylight global perspective pairing identity and operating context.',credit:'Amir Hanna / Unsplash',source:'https://unsplash.com/photos/city-skyline-under-blue-sky-during-daytime-TQBDoQY2MhA',license:'https://unsplash.com/license',nativeWidth:6000,nativeHeight:4000},
 {id:'command',name:'Immersive Command',composition:'command',image:'/assets/scenery/07-hintersee-winter.jpg',nativeFile:'design-assets/signin-native/07-hintersee-winter.jpg',focalPoint:'50% 52%',night:true,city:'Hintersee, Austria · alpine operations horizon',description:'A focused command environment with cool depth and controlled illumination.',credit:'Philipp (@picture_scape) / Unsplash',source:'https://unsplash.com/photos/snowy-mountain-and-frozen-lake-landscape-WVa3a36JBE4',license:'https://unsplash.com/license',nativeWidth:8620,nativeHeight:6081},
 {id:'gallery',name:'Global Gallery',composition:'gallery',image:'/assets/scenery/08-moraine-lake.jpg',nativeFile:'design-assets/signin-native/08-moraine-lake.jpg',focalPoint:'50% 42%',night:false,city:'Alberta, Canada · mountain and lake landscape',description:'A spacious global composition that uses natural depth as the visual frame.',credit:'Tim Woolliscroft / Unsplash',source:'https://unsplash.com/photos/a-blue-lake-surrounded-by-mountains-and-trees-mng2Ko7FaB0',license:'https://unsplash.com/license',nativeWidth:6248,nativeHeight:7960},
 {id:'focus',name:'First Light',composition:'focus',image:'/assets/scenery/10-olympic-sunrise.jpg',nativeFile:'design-assets/signin-native/10-olympic-sunrise.jpg',focalPoint:'50% 50%',night:false,city:'Olympic Peninsula, United States · first-light horizon',description:'A calm first-light system that prioritizes the next decisive action.',credit:'Dave Hoefler / Unsplash',source:'https://unsplash.com/photos/body-of-water-with-golden-time-i0K3-IHiXYI',license:'https://unsplash.com/license',nativeWidth:5507,nativeHeight:3442},
];
/** Runtime candidates intentionally stop at the 3840 derivative. Native originals stay outside public/ for provenance and future processing, never as browser assets. */
export function imageSrcSet(p:SignInPreset){return [640,1280,2560,3840].map(w=>p.image.replace('.jpg','-'+w+'.webp')+' '+w+'w').join(', ');}
export function imageRuntimeFallback(p:SignInPreset){return p.image.replace('.jpg','-1280.webp');}

export const worldLocations = [
  { id:'ibadan', name:'Daenem Complex / Ibadan', zone:'Africa/Lagos' },
  { id:'lagos', name:'Lagos', zone:'Africa/Lagos' },
  { id:'toronto', name:'Toronto', zone:'America/Toronto' },
  { id:'london', name:'London', zone:'Europe/London' },
  { id:'new-york', name:'New York', zone:'America/New_York' },
  { id:'moscow', name:'Moscow', zone:'Europe/Moscow' },
  { id:'tokyo', name:'Tokyo', zone:'Asia/Tokyo' },
  { id:'shanghai', name:'Beijing / Shanghai', zone:'Asia/Shanghai' },
];
