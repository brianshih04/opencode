import { Effect, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import os from "os"
import { randomUUID } from "crypto"
import type { Bridge } from "./index"
import { Watcher } from "./watcher"

export namespace Outgoing {
  const log = Log.create({ service: "bridge.outgoing" })

  function writeJson(dir: string, data: object): Effect.Effect<void> {
    return Effect.sync(() => {
      fsNode.mkdirSync(dir, { recursive: true })
      const filename = `${Date.now()}-${randomUUID()}.json`
      const filepath = path.join(dir, filename)
      fsNode.writeFileSync(filepath, JSON.stringify(data, null, 2))
      log.info("wrote file", { filepath: filename })
    })
  }

  export interface Interface {
    readonly writeStatus: (msg: Bridge.StatusMessage) => Effect.Effect<void>
    readonly writeQuestion: (msg: Bridge.QuestionMessage) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/BridgeOutgoing") {}

  export function make(basePath: string): Interface {
    const statusDir = path.join(basePath, "outgoing", "status")
    const questionDir = path.join(basePath, "outgoing", "question")

    return {
      writeStatus: (msg) => writeJson(statusDir, msg),
      writeQuestion: (msg) => writeJson(questionDir, msg),
    }
  }

  /** Default layer — will be overridden by Bridge.layer with config-aware path */
  export const layer = Layer.succeed(
    Service,
    Service.of(make(Watcher.resolveBasePath())),
  )
}
