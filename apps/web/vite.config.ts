import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const viteEnv = Object.keys(process.env)
  .filter((k) => k.startsWith("VITE_"))
  .reduce<Record<string, string>>((a, k) => {
    a[k] = process.env[k] ?? "";
    return a;
  }, {});

const devCookies = new Map<string, string>();

function updateCookieJar(setCookieHeaders: string | string[] | undefined) {
  if (!setCookieHeaders) return;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of list) {
    const [nameVal] = c.split(";");
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx > -1) {
      const name = nameVal.slice(0, eqIdx).trim();
      const val = nameVal.slice(eqIdx + 1).trim();
      if (/max-age=0/i.test(c) || /expires=[^;]*1970/i.test(c)) {
        devCookies.delete(name);
      } else {
        devCookies.set(name, val);
      }
    }
  }
}

function syncReqCookies(proxyReq: any, req: any) {
  proxyReq.setHeader("Host", "plane.tuicbb.my.id");
  proxyReq.setHeader("Origin", "https://plane.tuicbb.my.id");
  proxyReq.setHeader("Referer", "https://plane.tuicbb.my.id/");

  const incomingCookieHeader = (proxyReq.getHeader("cookie") as string) || req.headers.cookie || "";
  const cookiesMap = new Map<string, string>();
  if (incomingCookieHeader) {
    incomingCookieHeader.split(";").forEach((pair: string) => {
      const idx = pair.indexOf("=");
      if (idx > -1) {
        cookiesMap.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    });
  }
  for (const [name, val] of devCookies.entries()) {
    if (!cookiesMap.has(name)) {
      cookiesMap.set(name, val);
    }
  }
  const mergedCookieHeader = Array.from(cookiesMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (mergedCookieHeader) {
    proxyReq.setHeader("cookie", mergedCookieHeader);
  }
}

function cleanProxyRes(proxyRes: any, req?: any) {
  delete proxyRes.headers["x-frame-options"];
  delete proxyRes.headers["content-security-policy"];
  updateCookieJar(proxyRes.headers["set-cookie"]);

  if (proxyRes.headers["set-cookie"]) {
    proxyRes.headers["set-cookie"] = proxyRes.headers["set-cookie"].map((c: string) => {
      let updated = c.replace(/;\s*Domain=[^;]+/gi, "");
      if (/SameSite=/i.test(updated)) {
        updated = updated.replace(/;\s*SameSite=[^;]+/gi, "; SameSite=None");
      } else {
        updated = `${updated}; SameSite=None`;
      }
      if (!/;\s*Secure/i.test(updated)) {
        updated = `${updated}; Secure`;
      }
      return updated;
    });
  }
  if (req && proxyRes.headers.location) {
    const clientHost = req.headers.host || "localhost:3000";
    proxyRes.headers.location = proxyRes.headers.location.replace(
      "https://plane.tuicbb.my.id",
      `http://${clientHost}`
    );
  }
}

export default defineConfig(() => ({
  define: {
    "process.env": JSON.stringify(viteEnv),
  },
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [reactRouter(), tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
  resolve: {
    alias: {
      "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
      "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
      "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
    },
    dedupe: ["react", "react-dom", "@headlessui/react"],
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:18080",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", syncReqCookies);
          proxy.on("proxyRes", cleanProxyRes);
        },
      },
      "/auth": {
        target: "http://127.0.0.1:18080",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", syncReqCookies);
          proxy.on("proxyRes", cleanProxyRes);
        },
      },
    },
  },
}));
