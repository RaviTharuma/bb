import type { ManagedProcess } from "@bb/process-utils";
import type { AgentRuntimeProcessHost, AgentRuntimeProcessHostSelection, AgentRuntimeProcessLaunch } from "./types.js";

export class ProviderProcessHostUnavailableError extends Error {
  constructor(implementationId: string) {
    super(`Required provider process host "${implementationId}" is unavailable`);
    this.name = "ProviderProcessHostUnavailableError";
  }
}

export async function resolveProviderProcessHost(args: {
  request: AgentRuntimeProcessLaunch;
  direct: (request: AgentRuntimeProcessLaunch) => ManagedProcess;
  selection?: AgentRuntimeProcessHostSelection;
  hosts?: readonly AgentRuntimeProcessHost[];
}): Promise<ManagedProcess> {
  if (args.selection === undefined) return args.direct(args.request);
  const host = args.hosts?.find((entry) => entry.implementationId === args.selection?.implementationId);
  if (host !== undefined) return await host.launch(args.request);
  if (args.selection.required) throw new ProviderProcessHostUnavailableError(args.selection.implementationId);
  return args.direct(args.request);
}
