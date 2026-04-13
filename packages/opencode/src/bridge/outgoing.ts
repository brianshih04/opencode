import { Effect, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type { Bridge } from "./index"

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

  export const layer = Layer.succeed(Service, Service.of(make(path.join(
    process.env.OC_BRIDGE_PATH || path.join(require("os").homedir(), ".opencode"),
    "bridge",
  ))))
}
