// Schema-driven settings form. Each field renders a control bound to a settings path and re-syncs on change.
import { getPath, type ChannelRef, type Settings } from '../../lib/defaults';
import { h, replaceChildren } from '../../lib/dom';
import { inChannelList } from '../../lib/match';
import { send } from '../../lib/messages';
import { toggle } from '../../lib/ui/components';

export type Field =
  | { kind: 'toggle'; path: string; label: string; hint?: string }
  | { kind: 'select'; path: string; label: string; options: [string, string][]; hint?: string; number?: boolean }
  | { kind: 'number'; path: string; label: string; min: number; max: number; step?: number; suffix?: string; hint?: string }
  | { kind: 'text'; path: string; label: string; placeholder?: string; secret?: boolean; hint?: string }
  | { kind: 'time'; path: string; label: string }
  | { kind: 'days'; path: string; label: string }
  | { kind: 'keywords'; path: string; label: string; hint?: string; placeholder?: string }
  | { kind: 'channels'; path: string; label: string; hint?: string }
  | { kind: 'categories'; path: string; label: string; hint?: string }
  | { kind: 'custom'; render: (api: FormApi) => Bound };

export interface FormApi {
  get: () => Settings;
  set: (path: string, value: unknown) => Promise<boolean>;
}

export interface Bound {
  el: HTMLElement;
  sync?: (s: Settings) => void;
}

const row = (label: string, hint: string | undefined, control: Node) =>
  h('div', { class: 'row' }, h('div', { class: 'label' }, h('span', null, label), hint ? h('small', null, hint) : null), control);

const block = (label: string, hint: string | undefined, ...body: Node[]) =>
  h('div', { class: 'block' }, h('div', { class: 'label' }, h('span', null, label), hint ? h('small', null, hint) : null), ...body);

export function renderField(f: Field, api: FormApi): Bound {
  const val = (path: string) => getPath(api.get(), path);

  switch (f.kind) {
    case 'toggle': {
      const t = toggle(Boolean(val(f.path)), async (v, input) => {
        if (!(await api.set(f.path, v))) input.checked = !v;
      }, f.label);
      const input = t.querySelector('input')!;
      return { el: row(f.label, f.hint, t), sync: (s) => (input.checked = Boolean(getPath(s, f.path))) };
    }
    case 'select': {
      const sel = h('select', { 'aria-label': f.label }, f.options.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = String(val(f.path));
      sel.addEventListener('change', async () => {
        const v = f.number ? Number(sel.value) : sel.value;
        if (!(await api.set(f.path, v))) sel.value = String(val(f.path));
      });
      return { el: row(f.label, f.hint, sel), sync: (s) => (sel.value = String(getPath(s, f.path))) };
    }
    case 'number': {
      const input = h('input', { type: 'number', min: f.min, max: f.max, step: f.step ?? 1, value: String(val(f.path)), 'aria-label': f.label });
      input.addEventListener('change', async () => {
        let n = Number(input.value);
        if (!Number.isFinite(n)) n = Number(val(f.path));
        n = Math.min(f.max, Math.max(f.min, n));
        input.value = String(n);
        if (!(await api.set(f.path, n))) input.value = String(val(f.path));
      });
      const ctl = h('span', { class: 'num' }, input, f.suffix ? h('span', { class: 'muted' }, f.suffix) : null);
      return { el: row(f.label, f.hint, ctl), sync: (s) => document.activeElement !== input && (input.value = String(getPath(s, f.path))) };
    }
    case 'text': {
      const input = h('input', { type: f.secret ? 'password' : 'text', placeholder: f.placeholder ?? '', value: String(val(f.path) ?? ''), 'aria-label': f.label, style: { width: '260px' } });
      input.addEventListener('change', () => void api.set(f.path, input.value.trim()));
      return { el: row(f.label, f.hint, input), sync: (s) => document.activeElement !== input && (input.value = String(getPath(s, f.path) ?? '')) };
    }
    case 'time': {
      const input = h('input', { type: 'time', value: String(val(f.path)), 'aria-label': f.label });
      input.addEventListener('change', () => void api.set(f.path, input.value));
      return { el: row(f.label, undefined, input), sync: (s) => (input.value = String(getPath(s, f.path))) };
    }
    case 'days': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const wrap = h('div', { class: 'seg' });
      const draw = (days: number[]) =>
        replaceChildren(wrap, names.map((n, i) =>
          h('button', {
            type: 'button',
            'aria-pressed': String(days.includes(i)),
            onclick: () => {
              const cur = (val(f.path) as number[]) ?? [];
              void api.set(f.path, cur.includes(i) ? cur.filter((d) => d !== i) : [...cur, i].sort());
            },
          }, n),
        ));
      draw((val(f.path) as number[]) ?? []);
      return { el: row(f.label, undefined, wrap), sync: (s) => draw((getPath(s, f.path) as number[]) ?? []) };
    }
    case 'keywords': {
      const chips = h('div', { class: 'chips' });
      const input = h('input', { type: 'text', placeholder: f.placeholder ?? 'Add a word or /regex/ and press Enter', style: { flex: '1' } });
      const draw = (list: string[]) =>
        replaceChildren(chips, list.length ? list.map((k) =>
          h('span', { class: 'chip' }, k, h('button', { 'aria-label': `Remove ${k}`, onclick: () => void api.set(f.path, list.filter((x) => x !== k)) }, '×')),
        ) : h('span', { class: 'faint' }, 'None'));
      const add = () => {
        const v = input.value.trim();
        const list = (val(f.path) as string[]) ?? [];
        if (v && !list.includes(v)) void api.set(f.path, [...list, v]);
        input.value = '';
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
      draw((val(f.path) as string[]) ?? []);
      return {
        el: block(f.label, f.hint, h('div', { class: 'add' }, input, h('button', { class: 'btn', onclick: add }, 'Add')), chips),
        sync: (s) => draw((getPath(s, f.path) as string[]) ?? []),
      };
    }
    case 'channels': {
      const chips = h('div', { class: 'chips' });
      const input = h('input', { type: 'text', placeholder: 'Channel URL, @handle or name', style: { flex: '1' } });
      const status = h('small', { class: 'muted' });
      const btn = h('button', { class: 'btn' }, 'Add');
      const draw = (list: ChannelRef[]) =>
        replaceChildren(chips, list.length ? list.map((c) =>
          h('span', { class: 'chip', title: [c.handle, c.id].filter(Boolean).join(' · ') || 'Matched by name only' },
            c.id ? h('a', { href: `https://www.youtube.com/channel/${c.id}`, target: '_blank', style: { textDecoration: 'none' } }, c.name) : h('span', null, c.name),
            !c.id ? h('span', { class: 'faint' }, '(name only)') : null,
            h('button', { 'aria-label': `Remove ${c.name}`, onclick: () => void api.set(f.path, list.filter((x) => x !== c)) }, '×'),
          ),
        ) : h('span', { class: 'faint' }, 'None'));
      const add = async () => {
        const v = input.value.trim();
        if (!v) return;
        btn.disabled = true;
        status.textContent = 'Looking up channel…';
        try {
          const ref = await send('channel:resolve', { input: v });
          const list = (val(f.path) as ChannelRef[]) ?? [];
          if (!inChannelList(list, ref)) await api.set(f.path, [...list, ref]);
          status.textContent = ref.id ? `Added ${ref.name}` : `Added "${ref.name}" (matched by name; the custom feed needs a URL or @handle)`;
          input.value = '';
        } catch (e) {
          status.textContent = e instanceof Error ? e.message : 'Could not add channel';
        } finally {
          btn.disabled = false;
        }
      };
      btn.addEventListener('click', () => void add());
      input.addEventListener('keydown', (e) => e.key === 'Enter' && void add());
      draw((val(f.path) as ChannelRef[]) ?? []);
      return {
        el: block(f.label, f.hint, h('div', { class: 'add' }, input, btn), status, chips),
        sync: (s) => draw((getPath(s, f.path) as ChannelRef[]) ?? []),
      };
    }
    case 'categories': {
      const grid = h('div', { class: 'cats' }, h('span', { class: 'faint' }, 'Loading…'));
      let cats: { id: string; title: string }[] = [];
      const draw = (sel: string[]) => {
        if (!cats.length) return;
        replaceChildren(grid, cats.map((c) => {
          const cb = h('input', { type: 'checkbox', checked: sel.includes(c.id) });
          cb.addEventListener('change', () => {
            const cur = (val(f.path) as string[]) ?? [];
            void api.set(f.path, cb.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id));
          });
          return h('label', { class: 'cat' }, cb, c.title);
        }));
      };
      const load = async () => {
        if (!api.get().api.youtubeKey) {
          replaceChildren(grid, h('span', { class: 'faint' }, 'Add a YouTube API key (in "YouTube API") to filter by category.'));
          return;
        }
        try {
          cats = await send('yt:categories', {});
          draw((val(f.path) as string[]) ?? []);
        } catch (e) {
          replaceChildren(grid, h('span', { class: 'error' }, e instanceof Error ? e.message : 'Could not load categories'));
        }
      };
      void load();
      let lastKey = api.get().api.youtubeKey;
      return {
        el: block(f.label, f.hint, grid),
        sync: (s) => {
          if (s.api.youtubeKey !== lastKey) {
            lastKey = s.api.youtubeKey;
            void load();
          } else draw((getPath(s, f.path) as string[]) ?? []);
        },
      };
    }
    case 'custom':
      return f.render(api);
  }
}
