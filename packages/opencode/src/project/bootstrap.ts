import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
import { Project } from "./project"
import { Vcs } from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import { Bridge } from "@/bridge"
import { Config } from "@/config/config"
import { Question } from "@/question"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  File.init()
  FileWatcher.init()
  Vcs.init()
  Snapshot.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })

  // Bridge: initialize if enabled in config
  try {
    const config = await Config.get()
    if (config.bridge?.enabled) {
      await Bridge.init()
      Log.Default.info("bridge enabled and initialized")

      // Subscribe to question events to bridge them to Telegram
      Bus.subscribe(Question.Event.Asked, async (payload) => {
        try {
          const req = payload.properties
          const firstQ = req.questions[0]
          if (firstQ) {
            const choices = firstQ.options.map((opt, i) => ({ index: i, label: opt.label }))
            Bridge.sendQuestion({
              questionId: String(req.id),
              title: firstQ.header,
              message: firstQ.question,
              choices,
              sessionId: req.sessionID,
              multiple: firstQ.multiple,
            }).catch(() => {})
          }
        } catch {}
      })

      // Cleanup on exit
      const origDispose = Instance.dispose.bind(Instance)
      const bridgeDispose = async () => {
        await Bridge.shutdown().catch(() => {})
      }
      process.on("exit", bridgeDispose)
      process.on("SIGINT", bridgeDispose)
      process.on("SIGTERM", bridgeDispose)
    }
  } catch (e) {
    Log.Default.warn("bridge init failed", { error: String(e) })
  }
}
