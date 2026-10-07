import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPluginParam,
  showPluginSkills,
  subscribeToPluginLinks,
  subscribeToUrl,
  writePluginParam,
} from "./url-state.ts";

afterEach(() => {
  writePluginParam(null, { hash: "" });
});

describe("subscribeToUrl", () => {
  it("reports a change when the visitor goes back", async () => {
    writePluginParam("laravel", { push: true });
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);

    window.history.back();

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(readPluginParam()).toBeNull();
    unsubscribe();
  });

  it("reports changes made through writePluginParam, until unsubscribed", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToUrl(onChange);

    writePluginParam("review");
    unsubscribe();
    writePluginParam("laravel");

    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("showPluginSkills", () => {
  it("filters to the plugin at #skills and tells link subscribers", () => {
    const onFollow = vi.fn();
    const unsubscribe = subscribeToPluginLinks(onFollow);

    showPluginSkills("laravel");

    expect(readPluginParam()).toBe("laravel");
    expect(window.location.hash).toBe("#skills");
    expect(onFollow).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("is not reported for other URL changes", () => {
    const onFollow = vi.fn();
    const unsubscribe = subscribeToPluginLinks(onFollow);

    writePluginParam("laravel");

    expect(onFollow).not.toHaveBeenCalled();
    unsubscribe();
  });
});
