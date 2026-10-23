/**
 * Owner Studio preflight. This is a structural review gate ONLY.
 *
 * Passing does not activate a concept or establish auth, accessibility,
 * integration, responsive visual or production acceptance. The approved V180
 * Sign-In stays the sole public experience until those checks are complete.
 */
type Block = {
  id: string; kind: string; label: string; x: number; y: number;
  width: number; height: number;
};
export type SignInDesignReview = {
  structuralPass: boolean;
  readyToPublish: false;
  blockers: string[];
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  pendingAcceptance: string[];
};
const viewports = [
  { name: 'Mobile 390px', width: 390, height: 844, scrollVertical: true },
  { name: 'Tablet 768px', width: 768, height: 1024, scrollVertical: true },
  { name: 'Compact desktop 1024px', width: 1024, height: 768, scrollVertical: false },
  { name: 'Standard desktop 1280px', width: 1280, height: 720, scrollVertical: false },
  { name: 'Laptop 1366px', width: 1366, height: 900, scrollVertical: false },
  { name: 'Desktop 1920px', width: 1920, height: 1080, scrollVertical: false },
  { name: '32-inch 4K 3840px', width: 3840, height: 2160, scrollVertical: false },
] as const;

export function inspectSignInDesign(design: { name: string; blocks: Block[] }): SignInDesignReview {
  const blockers: string[] = [];
  const checks: SignInDesignReview['checks'] = [];
  const add = (name: string, passed: boolean, detail: string) => {
    checks.push({ name, passed, detail }); if (!passed) blockers.push(name + ': ' + detail);
  };
  const blocks = design.blocks || [];
  const auth = blocks.filter(b => b.kind === 'auth');
  const branding = blocks.filter(b => b.kind === 'brand');
  const headings = blocks.filter(b => b.kind === 'heading');
  add('Protected authentication', auth.length === 1, 'Exactly one protected Sign-In component is required.');
  add('DAENEM branding', branding.length >= 1, 'Include a visible DAENEM Branding component.');
  add('Accessible page heading', headings.length >= 1, 'Include at least one Page Heading component.');
  if (auth.length === 1) {
    const a = auth[0];
    add('Authentication usable size', a.width >= 300 && a.height >= 250,
      'The protected Sign-In panel needs at least 300px width and 250px height.');
    const collision = blocks.find(b => b.id !== a.id && (() => {
      const overlapW = Math.max(0, Math.min(a.x+a.width,b.x+b.width) - Math.max(a.x,b.x));
      const overlapH = Math.max(0, Math.min(a.y+a.height,b.y+b.height) - Math.max(a.y,b.y));
      return overlapW * overlapH > Math.min(a.width*a.height,b.width*b.height) * .02;
    })());
    add('Protected authentication unobstructed', !collision,
      collision ? 'The authentication panel overlaps "'+collision.label+'". Move one component to keep fields accessible.'
        : 'Protected authentication must remain unobstructed.');
  }
  for (const viewport of viewports) {
    const sf = Math.max(1, viewport.width/1366);
    const offscreen = blocks.filter(b => (
      b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 ||
      (b.x+b.width)*sf > viewport.width+.5 ||
      (!viewport.scrollVertical && (b.y+b.height)*sf > viewport.height+.5)
    ));
    add('Viewport ' + viewport.name, offscreen.length === 0,
      offscreen.length
        ? offscreen.slice(0,3).map(b => b.label).join(', ') + ' would be clipped. Review responsive positioning.'
        : 'All components fit the viewport without horizontal clipping or desktop vertical scrolling.');
  }
  return {
    structuralPass: blockers.length === 0,
    readyToPublish: false,
    blockers, checks,
    pendingAcceptance: [
      'Real authenticated Sign-In, Create Account, Forgot Password, and provider integrations',
      'Keyboard focus, screen-reader labels, accessibility and reduced-motion acceptance',
      'Owner visual approval at 390px, 768px, 1024px, 1280px, 1366px, 1920px and true 3840px',
      'Cloudflare Pre-Production release validation with unchanged approved V180 fallback',
      'Independent authenticated publish and one-click rollback rehearsal',
    ],
  };
}
