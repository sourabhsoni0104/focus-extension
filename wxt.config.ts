import { defineConfig } from 'wxt';

export default defineConfig({
  imports: false,
  manifest: {
    name: 'FOCUS',
    description:
      'Distraction-free YouTube: no Shorts or recommendations, allowlisted homepage, player tools, ad blocking, Pomodoro and screen time.',
    permissions: [
      'storage',
      'unlimitedStorage',
      'tabs',
      'alarms',
      'idle',
      'notifications',
      'declarativeNetRequest',
      'favicon',
    ],
    host_permissions: [
      '*://*.youtube.com/*',
      'https://www.googleapis.com/*',
      'https://sponsor.ajay.app/*',
      'https://dearrow-thumb.ajay.app/*',
      'https://returnyoutubedislikeapi.com/*',
    ],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: 'FOCUS',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png' },
    },
    declarative_net_request: {
      rule_resources: [{ id: 'ads', enabled: true, path: 'rules/ads.json' }],
    },
    web_accessible_resources: [{ resources: ['icon/*.png'], matches: ['*://www.youtube.com/*'] }],
  },
});
