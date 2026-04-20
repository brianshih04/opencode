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
import { Bridge, Incoming } from "@/bridge"
import { Config } from "@/config/config"
import { Question } from "@/question"
import { SessionPrompt } from "@/session/prompt"

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

      // Subscribe to question events to bridge them to OpenClaw (Telegram).
      // Race semantics: TUI and Bridge both wait in parallel.
      // Whichever answer arrives first wins; Question.reply() is safe to call
      // only once because the pending entry is deleted after the first reply.
      Bus.subscribe(Question.Event.Asked, async (payload) => {
        try {
          const req = payload.properties
          const firstQ = req.questions[0]
          if (!firstQ) return

          const choices = firstQ.options.map((opt, i) => ({
            index: i,
            label: opt.label,
          }))

          // Fire-and-forget: sendQuestion blocks until answer or timeout.
          // If OpenClaw answers before TUI, we call Question.reply() to
          // resolve the pending question in OpenCode.
          const answerIndices = await Bridge.sendQuestion({
            questionId: String(req.id),
            title: firstQ.header,
            message: firstQ.question,
            choices,
            sessionId: req.sessionID,
            multiple: firstQ.multiple,
          }).catch(() => [] as number[])

          // Non-empty answer means OpenClaw responded — feed back to Question
          if (answerIndices.length > 0) {
            const selectedLabels = answerIndices
              .map((i) => firstQ.options[i]?.label)
              .filter((label): label is string => label !== undefined)

            if (selectedLabels.length > 0) {
              await Question.reply({
                requestID: req.id,
                answers: [selectedLabels],
              }).catch(() => {
                // Question already replied via TUI — ignore
              })
            }
          }
        } catch {
          // Bridge question failed — TUI path is unaffected
        }
      })

      // Subscribe to external prompts from OpenClaw (Telegram)
      Bus.subscribe(Incoming.ExternalPrompt, async (payload) => {
        try {
          const { sessionID, message } = payload.properties
          if (!sessionID) {
            Log.Default.warn("bridge: external prompt missing sessionID")
            return
          }
          await SessionPrompt.prompt({
            sessionID,
            parts: [{ type: "text", text: message }],
          })
        } catch (e) {
          Log.Default.error("bridge: failed to process external prompt", { error: String(e) })
        }
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
