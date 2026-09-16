import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

import { maintainerAvatarUrl, MAINTAINERS } from "./maintainers";

describe("maintainerAvatarUrl", () => {
  it("builds the github avatar url for a username", () => {
    expect(maintainerAvatarUrl("octocat")).toBe(
      "https://github.com/octocat.png",
    );
  });
});

describe("image remotePatterns", () => {
  const patterns = nextConfig.images?.remotePatterns ?? [];

  it("allows exactly one path per maintainer", () => {
    expect(patterns.map((pattern) => pattern.pathname).sort()).toEqual(
      MAINTAINERS.map((username) => `/${username}.png`).sort(),
    );
  });

  it("never allows a wildcard path, which would proxy any github avatar", () => {
    for (const pattern of patterns) {
      expect(pattern.hostname).toBe("github.com");
      expect(pattern.protocol).toBe("https");
      expect(pattern.pathname).not.toContain("*");
    }
  });

  it("covers every avatar the requests page renders", () => {
    for (const username of MAINTAINERS) {
      const url = new URL(maintainerAvatarUrl(username));
      expect(
        patterns.some(
          (pattern) =>
            pattern.hostname === url.hostname &&
            pattern.pathname === url.pathname,
        ),
      ).toBe(true);
    }
  });
});
