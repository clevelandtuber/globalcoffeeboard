// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Your production URL — used for sitemap, canonical URLs, SEO.
  // This assumes the site is served at the domain root (custom domain
  // or Netlify). If you deploy to a GitHub Pages *project* URL like
  // username.github.io/globalcoffeeboard/, also set `base: '/globalcoffeeboard'`.
  site: 'https://globalcoffeeboard.com',

  // Tailwind CSS v4 via the official Vite plugin.
  vite: {
    plugins: [tailwindcss()],
  },
});
