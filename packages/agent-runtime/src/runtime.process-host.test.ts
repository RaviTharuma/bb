import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sanitizeInheritedChildProcessEnv,
  spawnManagedProcess,
} from "@bb/process-utils";
import { createAgentRuntime } from "./runtime.js";
import { ProviderProcessHostUnavailableError } from "./process-host.js";
import { createScriptedEchoRuntime } from "./test/runtime-test-harness.js";
import type {
  AgentRuntimeProcessHost,
  AgentRuntimeProcessLaunch,
} from "./types.js";

const workspacePaths: string[] = [];

function createWorkspacePath(): string {
  const workspacePath = mkdtempSync(
    join(tmpdir(), "bb-process-host-workspace-"),
  );
  workspacePaths.push(workspacePath);
  return workspacePath;
}

afterEach(() => {
  for (const workspacePath of workspacePaths.splice(0)) {
    rmSync(workspacePath, { recursive: true, force: true });
  }
});

describe("createAgentRuntime process hosts", () => {
  it("starts providers directly when no host is selected", async () => {
    const runtime = createScriptedEchoRuntime({
      runtime: { workspacePath: createWorkspacePath(), onEvent: vi.fn() },
    });
    try {
      await expect(
        runtime.listModels({ providerId: "scripted-echo" }),
      ).resolves.toBeDefined();
    } finally {
      await runtime.shutdown();
    }
  });

  it("routes startup through the selected host with the exact sanitized launch request", async () => {
    const workspacePath = createWorkspacePath();
    const inheritedEnv = {
      ...sanitizeInheritedChildProcessEnv({ env: process.env }),
    };
    const launch = vi.fn(async (request: AgentRuntimeProcessLaunch) =>
      spawnManagedProcess(request),
    );
    const host: AgentRuntimeProcessHost = { implementationId: "herdr", launch };
    const runtime = createScriptedEchoRuntime({
      runtime: {
        workspacePath,
        env: {
          PROCESS_HOST_TEST_ENV: "forwarded",
        },
        onEvent: vi.fn(),
        processHosts: [host],
      },
      launch: {
        processHost: {
          implementationId: "herdr",
          compatibilityKey: "target-a",
          required: true,
        },
      },
    });
    try {
      await runtime.listModels({ providerId: "scripted-echo" });
      expect(launch).toHaveBeenCalledTimes(1);
      const request = launch.mock.calls[0]?.[0];
      expect(request).toEqual({
        command: process.execPath,
        args: expect.arrayContaining([
          expect.stringContaining("scripted-echo-provider.mjs"),
        ]),
        cwd: workspacePath,
        env: {
          ...inheritedEnv,
          PROCESS_HOST_TEST_ENV: "forwarded",
        },
      });
      expect(
        Object.keys(request?.env ?? {}).some((key) => key.startsWith("BB_")),
      ).toBe(false);
    } finally {
      await runtime.shutdown();
    }
  });

  it("falls back to direct startup when an optional selected host is unavailable", async () => {
    const runtime = createScriptedEchoRuntime({
      runtime: {
        workspacePath: createWorkspacePath(),
        onEvent: vi.fn(),
        processHosts: [],
      },
      launch: {
        processHost: {
          implementationId: "missing",
          compatibilityKey: "target-a",
          required: false,
        },
      },
    });
    try {
      await expect(
        runtime.listModels({ providerId: "scripted-echo" }),
      ).resolves.toBeDefined();
    } finally {
      await runtime.shutdown();
    }
  });

  it("fails startup when a required selected host is unavailable", async () => {
    const runtime = createScriptedEchoRuntime({
      runtime: {
        workspacePath: createWorkspacePath(),
        onEvent: vi.fn(),
        processHosts: [],
      },
      launch: {
        processHost: {
          implementationId: "missing",
          compatibilityKey: "target-a",
          required: true,
        },
      },
    });
    try {
      await expect(
        runtime.listModels({ providerId: "scripted-echo" }),
      ).rejects.toBeInstanceOf(ProviderProcessHostUnavailableError);
    } finally {
      await runtime.shutdown();
    }
  });

  it("rejects duplicate process host implementation IDs deterministically", () => {
    const first: AgentRuntimeProcessHost = {
      implementationId: "herdr",
      launch: vi.fn(),
    };
    const second: AgentRuntimeProcessHost = {
      implementationId: "herdr",
      launch: vi.fn(),
    };

    expect(() =>
      createAgentRuntime({
        workspacePath: createWorkspacePath(),
        onEvent: vi.fn(),
        onToolCall: vi.fn(),
        processHosts: [first, second],
      }),
    ).toThrowError(
      "Duplicate agent runtime process host implementation ID: herdr",
    );
  });
});
