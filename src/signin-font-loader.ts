const SIGNIN_LEGACY_FONT_URL = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap';
const SIGNIN_LEGACY_FONT_ATTRIBUTE = 'data-staffportal-signin-legacy-fonts';

export function mountSignInLegacyFonts(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  const existing = document.head.querySelector<HTMLLinkElement>(`link[${SIGNIN_LEGACY_FONT_ATTRIBUTE}]`);
  const link = existing || document.createElement('link');
  const previousUsers = Number(link.dataset.staffportalFontUsers || '0');
  link.dataset.staffportalFontUsers = String(previousUsers + 1);

  if (!existing) {
    link.rel = 'stylesheet';
    link.href = SIGNIN_LEGACY_FONT_URL;
    link.setAttribute(SIGNIN_LEGACY_FONT_ATTRIBUTE, 'true');
    document.head.appendChild(link);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const users = Math.max(0, Number(link.dataset.staffportalFontUsers || '1') - 1);
    if (users === 0) link.remove();
    else link.dataset.staffportalFontUsers = String(users);
  };
}
