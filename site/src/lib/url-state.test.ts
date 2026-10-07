import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pluginSkillsHref,
  readSearchParam,
  showPluginSkills,
  subscribeToUrl,
  writeSearchParams,
} from "./url-state.ts";

afterEach(() => {
  vi.restoreAllMocks();
  writeSearchParams(
    { q: null, plugin: null, skill: null },
    { hash: "", state: null },
  );
});

describe("writeSearchParams", () => {
  it("sets and removes parameters, keeping the others and the hash", () => {
    writeSearchParams({ plugin: "review" }, { hash: "skills" });
    writeSearchParams({ q: "brief", skill: "deep" });
    expect(readSearchParam("plugin")).toBe("review");
    expect(readSearchParam("q")).toBe("brief");
    expect(window.location.hash).toBe("#skills");

    writeSearchParams({ q: "", skill: null });
    expect(readSearchParam("q")).toBeNull();
    expect(readSearchParam("skill")).toBeNull();
    expect(readSearchParam("plugin")).toBe("review");
  });

  it("replaces the history entry unless asked to push, and notifies subscribers", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);
    const length = window.history.length;

    writeSearchParams({ skill: "deep" });
    expect(window.history.length).toBe(length);
    writeSearchParams({ skill: "deep" });
    expect(onChange).toHaveBeenCalledTimes(1);

    writeSearchParams({ skill: "brief" }, { push: true });
    expect(window.history.length).toBe(length + 1);
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("follows a change the browser refuses, and writes it with the next one it accepts", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {
        throw new DOMException("Too many calls", "SecurityError");
      });

    expect(() => writeSearchParams({ plugin: "review" })).not.toThrow();
    expect(new URLSearchParams(window.location.search).has("plugin")).toBe(
      false,
    );
    expect(readSearchParam("plugin")).toBe("review");
    expect(onChange).toHaveBeenCalledOnce();

    replaceState.mockRestore();
    writeSearchParams({ q: "brief" });
    expect(new URLSearchParams(window.location.search).get("plugin")).toBe(
      "review",
    );
    expect(readSearchParam("q")).toBe("brief");
    unsubscribe();
  });

  it("drops a refused change once the address moves on", async () => {
    vi.spyOn(window.history, "pushState").mockImplementationOnce(() => {
      throw new DOMException("Too many calls", "SecurityError");
    });
    writeSearchParams({ plugin: "laravel" }, { push: true });
    expect(readSearchParam("plugin")).toBe("laravel");

    window.location.hash = "elsewhere";

    await expect.poll(() => window.location.hash).toBe("#elsewhere");
    expect(readSearchParam("plugin")).toBeNull();
  });

  it("sets the history entry's state when asked, keeping it otherwise", () => {
    writeSearchParams({ skill: "deep" }, { push: true, state: "marked" });
    expect(window.history.state).toBe("marked");
    writeSearchParams({ skill: "brief" });
    expect(window.history.state).toBe("marked");
  });
});

describe("pluginSkillsHref", () => {
  it("links to the catalog filtered to the plugin", () => {
    expect(pluginSkillsHref("laravel")).toBe("?plugin=laravel#skills");
  });
});

describe("subscribeToUrl", () => {
  it("reports a change when the visitor goes back", async () => {
    writeSearchParams({ plugin: "laravel" }, { push: true });
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);

    window.history.back();

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(readSearchParam("plugin")).toBeNull();
    unsubscribe();
  });

  it("reports changes made through writeSearchParams, until unsubscribed", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);

    writeSearchParams({ plugin: "review" });
    unsubscribe();
    writeSearchParams({ plugin: "laravel" });

    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("showPluginSkills", () => {
  it("filters to the plugin at #skills, clearing the query and the skill, in a new entry", async () => {
    writeSearchParams({ q: "brief", skill: "deep" });

    showPluginSkills("laravel");

    expect(readSearchParam("plugin")).toBe("laravel");
    expect(readSearchParam("q")).toBeNull();
    expect(readSearchParam("skill")).toBeNull();
    expect(window.location.hash).toBe("#skills");

    window.history.back();
    await expect.poll(() => readSearchParam("q")).toBe("brief");
  });
});
