import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { createLogger } from "../../server/logger.js";

const config = loadConfig({ NODE_ENV: "test" });
const app = createApp({ config, logger: createLogger(config) });

describe("server app", () => {
  it("reports health", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "chosen-one", mode: "live" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});

describe("config", () => {
  it("rejects an invalid public base URL", () => {
    expect(() => loadConfig({ PUBLIC_BASE_URL: "not-a-url" })).toThrow(/PUBLIC_BASE_URL/);
  });

  it("applies defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.PORT).toBe(3000);
    expect(cfg.DEMO_MODE).toBe("live");
  });

  it("parses boolean flags from strings", () => {
    expect(loadConfig({}).SEED_DEMO_ON_START).toBe(true);
    expect(loadConfig({ SEED_DEMO_ON_START: "false" }).SEED_DEMO_ON_START).toBe(false);
  });

  it("treats blank values as unset", () => {
    const cfg = loadConfig({ PUBLIC_BASE_URL: "", DEMO_MODE: "" });
    expect(cfg.PUBLIC_BASE_URL).toBe("http://localhost:3000");
    expect(cfg.DEMO_MODE).toBe("live");
  });
});

describe("hosting configuration", () => {
  it("uses the URL Render publishes when PUBLIC_BASE_URL is not set", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      RENDER_EXTERNAL_URL: "https://chosen-one.onrender.com",
    });
    expect(config.PUBLIC_BASE_URL).toBe("https://chosen-one.onrender.com");
  });

  it("prefers an explicit PUBLIC_BASE_URL", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PUBLIC_BASE_URL: "https://example.com",
      RENDER_EXTERNAL_URL: "https://chosen-one.onrender.com",
    });
    expect(config.PUBLIC_BASE_URL).toBe("https://example.com");
  });
});
