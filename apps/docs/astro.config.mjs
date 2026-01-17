import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  vite: {
    ssr: {
      noExternal: ["zod"],
    },
  },
  integrations: [
    starlight({
      title: "Gambiarra",
      customCss: ["./src/styles/custom.css"],
      components: {
        Hero: "./src/components/Hero.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/arthurbm/gambiarra",
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Quick Start", slug: "guides/quickstart" },
            { label: "Hackathon Setup", slug: "guides/hackathon" },
            { label: "Home Lab Setup", slug: "guides/homelab" },
          ],
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
        {
          label: "Troubleshooting",
          autogenerate: { directory: "troubleshooting" },
        },
      ],
    }),
  ],
});
