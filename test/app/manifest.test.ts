import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR } from "@/lib/site";

describe("manifest", () => {
  it("names the app from the shared site constants", () => {
    const { name, short_name, description } = manifest();

    expect(name).toBe(SITE_NAME);
    expect(short_name).toBe(SITE_NAME);
    expect(description).toBe(SITE_DESCRIPTION);
  });

  it("uses the site's accent blue as the theme colour", () => {
    expect(manifest().theme_color).toBe(THEME_COLOR);
  });

  it("launches at the top page, scoped to the whole site", () => {
    const { start_url, scope, display } = manifest();

    expect(start_url).toBe("/");
    expect(scope).toBe("/");
    expect(display).toBe("standalone");
  });

  it("ships an installable icon plus a maskable one", () => {
    const icons = manifest().icons ?? [];

    // Chrome wants a >=192px icon before it offers to install.
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon.png",
          sizes: "512x512",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-maskable.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });

  it("points only at icons the site actually serves", () => {
    // /icon.png is app/icon.png via the file convention; /icon-maskable.png is
    // public/icon-maskable.png. Both are root-relative, never absolute URLs —
    // the manifest is fetched from whichever host serves it (production, the
    // alias, or a PR preview) and its icons must resolve there too.
    (manifest().icons ?? []).forEach((icon) => {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(icon.type).toBe("image/png");
    });
  });
});
