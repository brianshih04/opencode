import { Effect, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import os from "os"
import { execSync } from "child_process"

export namespace Watcher {
  const log = Log.create({ service: "bridge.watcher" })

  /**
   * Resolve the bridge base path.
   * Priority: OC_BRIDGE_PATH env > config.bridge.path > ~/.opencode/bridge
   *
   * We use ~/.opencode/bridge (not XDG data dir) because OpenClaw needs
   * a fixed, predictable path to scan for run.json files.
   */
  export function resolveBasePath(configPath?: string): string {
    if (process.env.OC_BRIDGE_PATH) return process.env.OC_BRIDGE_PATH
    if (configPath) return configPath
    return path.join(os.homedir(), ".opencode", "bridge")
  }

  function getGitBranch(cwd: string): string {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 3000 }).trim()
    } catch {
      return "unknown"
    }
  }

  export interface Interface {
    readonly basePath: string
    readonly initDirectories: () => Effect.Effect<void>
    readonly writeRunJson: () => Effect.Effect<void>
    readonly removeRunJson: () => Effect.Effect<void>
    readonly cleanStaleMessages: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/BridgeWatcher") {}

  export function make(basePath: string): Interface {
    return {
      basePath,
      initDirectories: () =>
        Effect.sync(() => {
          const dirs = [
            path.join(basePath, "outgoing", "status"),
            path.join(basePath, "outgoing", "question"),
            path.join(basePath, "incoming", "answer"),
            path.join(basePath, "incoming", "prompt"),
          ]
          for (const dir of dirs) {
            fsNode.mkdirSync(dir, { recursive: true })
          }
          log.info("directories initialized", { base: basePath })
        }),

      writeRunJson: () =>
        Effect.sync(() => {
          const runJsonPath = path.join(basePath, "run.json")
          const cwd = process.cwd()
          const runData = {
            pid: process.pid,
            cwd,
            branch: getGitBranch(cwd),
            started_at: new Date().toISOString(),
          }
          fsNode.mkdirSync(basePath, { recursive: true })
          fsNode.writeFileSync(runJsonPath, JSON.stringify(runData, null, 2))
          log.info("run.json written", { pid: process.pid, cwd, branch: runData.branch })
        }),

      removeRunJson: () =>
        Effect.sync(() => {
          const runJsonPath = path.join(basePath, "run.json")
          try {
            fsNode.unlinkSync(runJsonPath)
            log.info("run.json removed")
          } catch {
            // Already gone
          }
        }),

      cleanStaleMessages: () =>
        Effect.sync(() => {
          const dirs = [
            path.join(basePath, "outgoing", "status"),
            path.join(basePath, "outgoing", "question"),
            path.join(basePath, "incoming", "answer"),
            path.join(basePath, "incoming", "prompt"),
          ]
          let cleaned = 0
          for (const dir of dirs) {
            if (!fsNode.existsSync(dir)) continue
            const files = fsNode.readdirSync(dir).filter((f) => f.endsWith(".json"))
            for (const file of files) {
              try {
                fsNode.unlinkSync(path.join(dir, file))
                cleaned++
              } catch {
                // Skip locked files
              }
            }
          }
          if (cleaned > 0) {
            log.info("cleaned stale messages", { count: cleaned })
          }
        }),
    }
  }

  /**
   * Default layer using ~/.opencode/bridge.
   * The main Bridge layer overrides this with config-aware path.
   */
  export const layer = Layer.succeed(Service, Service.of(make(resolveBasePath())))
}
