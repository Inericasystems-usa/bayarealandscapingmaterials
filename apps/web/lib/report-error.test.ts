import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Browser error reports (lib/report-error.ts). */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { pathname: "/request-quote" } });
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const load = async () => (await import("./report-error")).reportClientError;

describe("reportClientError", () => {
  it("posts message, digest and the bare path to the same-origin endpoint", async () => {
    const report = await load();
    report(Object.assign(new Error("boom"), { digest: "1234567890" }), "global");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/client-errors");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(JSON.parse(String(init.body))).toEqual({ message: "boom", digest: "1234567890", path: "/request-quote", boundary: "global" });
  });

  it("sends the same error once, and at most five per page", async () => {
    const report = await load();
    for (let i = 0; i < 3; i++) report(new Error("same"));
    for (let i = 0; i < 10; i++) report(new Error(`different ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("drops a digest that is not a plain hash", async () => {
    const report = await load();
    report(Object.assign(new Error("x"), { digest: "<img src=x>" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).digest).toBeUndefined();
  });

  it("never throws, even when fetch does", async () => {
    fetchMock.mockImplementation(() => {
      throw new Error("offline");
    });
    const report = await load();
    expect(() => report(new Error("x"))).not.toThrow();
  });

  it("sends nothing from a development build", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const report = await load();
    report(new Error("x"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
