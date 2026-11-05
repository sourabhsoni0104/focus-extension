// Screen-time report for the options page: total, chart and full site list for 24h / today / 7 days.
import { h, replaceChildren } from '../../lib/dom';
import { duration } from '../../lib/format';
import { send } from '../../lib/messages';
import type { StRange } from '../../lib/types';
import { segmented, siteList, timeChart } from '../../lib/ui/components';
import type { Bound, FormApi } from './form';

const RANGE_LABEL: Record<StRange, string> = { '24h': 'in the last 24 hours', today: 'today', '7d': 'in the last 7 days' };

export function screentimeReport(_api: FormApi): Bound {
  let range: StRange = '24h';
  const body = h('div');

  const draw = async () => {
    const sum = await send('st:summary', { range });
    const avg = range === '7d' ? ` · ${duration(sum.total / 7)} a day on average` : '';
    replaceChildren(
      body,
      h('div', { class: 'st-hero' },
        h('div', null, h('div', { class: 'st-total' }, duration(sum.total)), h('div', { class: 'muted' }, `${RANGE_LABEL[range]}${avg}`)),
      ),
      h('div', { class: 'card' }, timeChart(sum, 160)),
      h('div', { class: 'card' }, siteList(sum)),
    );
  };

  const el = h('div', { class: 'block report' },
    h('div', { class: 'report-bar' },
      segmented<StRange>([['24h', 'Last 24h'], ['today', 'Today'], ['7d', '7 days']], range, (r) => {
        range = r;
        void draw();
      }),
      h('button', {
        class: 'btn danger small',
        onclick: async () => {
          if (!confirm('Delete all screen-time data?')) return;
          await send('st:reset', {});
          void draw();
        },
      }, 'Clear data'),
    ),
    body,
  );
  void draw();
  const timer = setInterval(() => (el.isConnected ? void draw() : clearInterval(timer)), 60000);
  return { el };
}
