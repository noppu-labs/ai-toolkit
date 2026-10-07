import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pluginSkillsHref,
  readSearchParam,
  showPluginSkills,
  subscribeToPluginLinks,
  subscribeToUrl,
  writeSearchParams,
} from "./url-state.ts";

afterEach(() => {
  writeSearchParams({ q: null, plugin: null, skill: null }, { hash: "" });
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

  it("leaves the URL alone when the browser refuses the change", () => {
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("Too many calls", "SecurityError");
    });
    expect(() => writeSearchParams({ q: "x" })).not.toThrow();
    expect(readSearchParam("q")).toBeNull();
    vi.restoreAllMocks();
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
  it("filters to the plugin at #skills and tells link subscribers", () => {
    const onFollow = vi.fn();
    const unsubscribe = subscribeToPluginLinks(onFollow);

    showPluginSkills("laravel");

    expect(readSearchParam("plugin")).toBe("laravel");
    expect(window.location.hash).toBe("#skills");
    expect(onFollow).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("is not reported for other URL changes", () => {
    const onFollow = vi.fn();
    const unsubscribe = subscribeToPluginLinks(onFollow);

    writeSearchParams({ plugin: "laravel" });

    expect(onFollow).not.toHaveBeenCalled();
    unsubscribe();
  });
});
