import './workspace-refinement.css';
import { api } from './auth';

type Context = { employee: { displayName: string }; companies: Array<{ name: string; primary: boolean }> };
type Me = { context?: Context };

let context: Context | null = null;
let scheduled = false;

function applyRefinement() {
  scheduled = false;
  const input = document.querySelector<HTMLInputElement>('.top-bar .search-wrap input');
  if (input && input.placeholder !== 'Ask anything about your workspace') {
    input.placeholder = 'Ask anything about your workspace';
  }
  if (context) observer.disconnect();
}

function scheduleRefinement() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(applyRefinement);
}

async function refreshContext() {
  try {
    context = (await api<Me>('/api/auth/me')).context || null;
    scheduleRefinement();
  } catch {
    context = null;
  }
}

window.addEventListener('load', () => { void refreshContext(); });
window.addEventListener('focus', () => { void refreshContext(); });
window.addEventListener('daenem-auth-changed', () => { void refreshContext(); });

const observer = new MutationObserver(scheduleRefinement);
observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
