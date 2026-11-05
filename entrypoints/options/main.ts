import '../../lib/ui/ui.css';
import './style.css';
import type { Settings } from '../../lib/defaults';
import { h, replaceChildren } from '../../lib/dom';
import { loadSettings, updatePath, watchSettings } from '../../lib/settings';
import { guard, toggle } from '../../lib/ui/components';
import { renderField, type Bound, type FormApi } from './form';
import { SECTIONS } from './sections';

let settings: Settings;
let mounted: Bound[] = [];
const app = document.getElementById('app')!;
const content = h('main');
const navLinks = new Map<string, HTMLAnchorElement>();
let masterInput: HTMLInputElement | null = null;

const api: FormApi = {
  get: () => settings,
  async set(path, value) {
    if (!(await guard(settings, path, value))) return false;
    settings = await updatePath(path, value);
    return true;
  },
};

function show(id: string) {
  const sec = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]!;
  navLinks.forEach((a, key) => a.setAttribute('aria-current', key === sec.id ? 'page' : 'false'));
  mounted = [];
  const groups = sec.groups.map((g) => {
    const fields = g.fields.map((f) => {
      const b = renderField(f, api);
      mounted.push(b);
      return b.el;
    });
    return h('div', { class: 'group' }, g.title ? h('h2', null, g.title) : null, h('div', { class: 'card' }, fields));
  });
  replaceChildren(content, h('h1', null, sec.title), sec.intro ? h('p', { class: 'intro' }, sec.intro) : null, groups);
  document.title = `${sec.title} · FOCUS`;
  window.scrollTo(0, 0);
}

async function init() {
  settings = await loadSettings();
  const nav = h('nav', null,
    SECTIONS.map((s) => {
      const a = h('a', { href: `#${s.id}` }, s.title);
      navLinks.set(s.id, a);
      return a;
    }),
  );
  const master = toggle(settings.enabled, async (v, input) => {
    if (!(await api.set('enabled', v))) input.checked = !v;
  }, 'FOCUS enabled');
  masterInput = master.querySelector('input');
  replaceChildren(
    app,
    h('div', { class: 'layout' },
      h('aside', null,
        h('div', { class: 'brand' }, h('img', { src: '/icon/48.png', alt: '' }), h('strong', null, 'FOCUS')),
        nav,
        h('div', { class: 'status' }, h('span', null, 'Extension enabled'), master),
      ),
      content,
    ),
  );
  watchSettings((s) => {
    settings = s;
    mounted.forEach((b) => b.sync?.(s));
    if (masterInput) masterInput.checked = s.enabled;
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'focus');
}

void init();
