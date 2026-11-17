import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const startUrl = env.VITE_APP_START_URL || '/pan-words/';
  const scope = env.VITE_APP_SCOPE || startUrl;
  const publicUrl = (env.VITE_APP_PUBLIC_URL || 'https://joelle-dev.github.io/pan-words/')
    .replace(/\/?$/, '/');

  return {
    base: './',
    define: {
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
    },
    plugins: [
      {
        name: 'app-public-url',
        transformIndexHtml(html) {
          return html.replaceAll('__APP_PUBLIC_URL__', publicUrl);
        }
      },
      vue(),
      Components({
        resolvers: [VantResolver()],
        dts: false
      }),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: 'Pan 淘词',
          short_name: 'Pan',
          description: '读书时拾词，闲时温故。本地优先的英语间隔重复。',
          lang: 'zh-CN',
          theme_color: '#faf5ec',
          background_color: '#faf5ec',
          display: 'standalone',
          orientation: 'portrait',
          start_url: startUrl,
          scope,
          categories: ['education', 'productivity'],
          shortcuts: [
            {
              name: '开始复习',
              short_name: '复习',
              description: '直接进入今天的复习队列',
              url: `${startUrl}#/review`,
              icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: '粘一段文字收词',
              short_name: '收词',
              description: '粘贴原文，扫出生词',
              url: `${startUrl}#/capture`,
              icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            }
          ],
          icons: [
            {
              src: './icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: './icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: './icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,ico,json,webmanifest}'],
          cleanupOutdatedCaches: true
        }
      })
    ],
    server: {
      port: 5174,
      open: false
    }
  };
});
