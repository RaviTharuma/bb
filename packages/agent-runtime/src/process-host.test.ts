import { describe, expect, it, vi } from "vitest";
import { resolveProviderProcessHost, ProviderProcessHostUnavailableError } from "./process-host.js";
import type { AgentRuntimeProcessHost } from "./types.js";

const managed = { child: {} as never, stop: vi.fn() };
const request = { command: "node", args: ["bridge.js"], cwd: "/workspace", env: {} };

describe("resolveProviderProcessHost", () => {
  it("uses direct execution by default", async () => {
    const direct = vi.fn(() => managed);
    expect(await resolveProviderProcessHost({ request, direct })).toBe(managed);
    expect(direct).toHaveBeenCalledWith(request);
  });
  it("selects the process host by implementation identity", async () => {
    const launch = vi.fn(async () => managed);
    const host: AgentRuntimeProcessHost = { implementationId: "herdr", launch };
    expect(await resolveProviderProcessHost({ request, direct: vi.fn(), selection: { implementationId: "herdr", compatibilityKey: "target-a", required: true }, hosts: [host] })).toBe(managed);
    expect(launch).toHaveBeenCalledWith(request);
  });
  it("fails when a required process host is unavailable", async () => {
    await expect(resolveProviderProcessHost({ request, direct: vi.fn(), selection: { implementationId: "missing", compatibilityKey: "target-a", required: true }, hosts: [] })).rejects.toBeInstanceOf(ProviderProcessHostUnavailableError);
  });
  it("uses direct execution when an optional process host is unavailable", async () => {
    const direct = vi.fn(() => managed);
    expect(await resolveProviderProcessHost({ request, direct, selection: { implementationId: "missing", compatibilityKey: "target-a", required: false }, hosts: [] })).toBe(managed);
  });
});
