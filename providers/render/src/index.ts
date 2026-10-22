import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

/**
 * The deployment is one container. The blueprint says which keys it expects;
 * this reads that list back so the running app can answer one honest question:
 * which of these are actually set here.
 *
 * The answer is printed as booleans. The keys themselves never leave the
 * environment.
 */

export interface Service {
  type: "web" | "worker" | "cron" | string;
  name: string;
  runtime?: string;
  healthCheckPath?: string;
  envVars?: { key: string; value?: string; sync?: boolean }[];
}

export interface Blueprint {
  services: Service[];
}

export function readBlueprint(path = "render.yaml"): Blueprint | null {
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf8")) as Blueprint;
}

/** Keys the service sets by itself rather than receiving from a dashboard. */
export function areSecret(service: Service | undefined): boolean {
  return Boolean(service?.envVars?.some((v) => v.sync === false));
}

/** The keys a deployer has to supply. Order is the order they appear. */
export function expectedKeys(service: Service | undefined): string[] {
  return (service?.envVars ?? []).filter((v) => v.sync === false).map((v) => v.key);
}

export interface DeploymentReport {
  service: string | null;
  healthCheckPath: string | null;
  /** One entry per key the deployer supplies, with whether it is set here. */
  keys: { key: string; set: boolean }[];
  /** True when at least one provider is switched on. */
  configured: boolean;
}

export function deploymentReport(
  blueprint: Blueprint | null,
  env: NodeJS.ProcessEnv = process.env,
): DeploymentReport {
  const service = blueprint?.services.find((s) => s.type === "web");
  if (!service) {
    return { service: null, healthCheckPath: null, keys: [], configured: false };
  }

  const keys = expectedKeys(service).map((key) => ({ key, set: Boolean(env[key]?.trim()) }));

  return {
    service: service.name,
    healthCheckPath: service.healthCheckPath ?? null,
    keys,
    configured: keys.some((k) => k.set),
  };
}
