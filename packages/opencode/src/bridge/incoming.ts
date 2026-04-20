import { Deferred, Duration, Effect, Exit, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import type { Bridge } from "./index"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { SessionID } from "@/session/schema"
import { SessionPrompt } from "@/session/prompt"

interface IncomingState {
  pending: Map<string, Deferred.Deferred<number[]>>
  watcher: fsNode.FSWatcher | null
}

export namespace Incoming {
  const log = Log.create({ service: "bridge.incoming" })

  interface PromptMessage {
    type: "prompt"
    session_id: string
    message: string
    timestamp: string
  }

  // Event for external prompts
  export const ExternalPrompt = BusEvent.define(
    "bridge.external.prompt",
    z.object({
      sessionID: SessionID.zod,
      message: z.string(),
    }),
  )

  function processAnswerFile(state: IncomingState, filepath: string): Effect.Effect<void> {
    return Effect.sync(() => {
      try {
        const raw = fsNode.readFileSync(filepath, "utf-8")
        const msg: Bridge.AnswerMessage = JSON.parse(raw)
        const deferred = state.pending.get(msg.question_id)
        if (deferred) {
          log.info("answer received", { question_id: msg.question_id, selected: msg.selected })
          Deferred.doneUnsafe(deferred, Exit.succeed(msg.selected))
          state.pending.delete(msg.question_id)
        } else {
          log.warn("answer for unknown question", { question_id: msg.question_id })
        }
        // Always delete after reading
        fsNode.unlinkSync(filepath)
      } catch (e) {
        log.error("failed to process answer", { error: String(e) })
      }
    })
  }

  function processExistingAnswers(state: IncomingState, dir: string): Effect.Effect<void> {
    return Effect.sync(() => {
      if (!fsNode.existsSync(dir)) return
      const files = fsNode.readdirSync(dir).filter((f) => f.endsWith(".json"))
      for (const file of files) {
        Effect.runSync(processAnswerFile(state, path.join(dir, file)))
      }
    })
  }

  export interface Interface {
    readonly waitForAnswer: (questionId: string, timeoutMinutes: number) => Effect.Effect<number[]>
    readonly startWatching: () => Effect.Effect<void>
    readonly stopWatching: () => Effect.Effect<void>
    readonly startPromptWatcher: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/BridgeIncoming") {}

  let promptWatcher: fsNode.FSWatcher | null = null

  export function make(answerDir: string, promptDir?: string): Interface {
    const state: IncomingState = {
      pending: new Map(),
      watcher: null,
    }

    return {
      waitForAnswer: (questionId, timeoutMinutes) =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<number[]>()
          state.pending.set(questionId, deferred)

          // Check for existing answers first
          yield* processExistingAnswers(state, answerDir)

          // Race between answer and timeout
          const timeout = Effect.delay(
            Effect.sync(() => {
              log.info("question timed out", { question_id: questionId })
            }),
            Duration.minutes(timeoutMinutes),
          )

          const result = yield* Effect.race(
            Deferred.await(deferred),
            Effect.andThen(timeout, Effect.succeed<number[]>([])),
          )

          return result
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              state.pending.delete(questionId)
            }),
          ),
        ),

      startWatching: () =>
        Effect.sync(() => {
          fsNode.mkdirSync(answerDir, { recursive: true })

          state.watcher = fsNode.watch(answerDir, (eventType, filename) => {
            if (!filename || !filename.endsWith(".json")) return
            const filepath = path.join(answerDir, filename)
            // Small delay to ensure file is fully written
            setTimeout(() => {
              if (fsNode.existsSync(filepath)) {
                Effect.runSync(processAnswerFile(state, filepath))
              }
            }, 100)
          })

          state.watcher.on("error", (err) => {
            log.error("watcher error", { error: String(err) })
          })

          log.info("watching answer directory", { dir: answerDir })
        }),

      stopWatching: () =>
        Effect.sync(() => {
          if (state.watcher) {
            state.watcher.close()
            state.watcher = null
          }
          if (promptWatcher) {
            promptWatcher.close()
            promptWatcher = null
          }
          // Resolve all pending with empty array (no answer)
          for (const [, deferred] of state.pending) {
            Deferred.doneUnsafe(deferred, Exit.succeed([]))
          }
          state.pending.clear()
          log.info("stopped watching")
        }),

      startPromptWatcher: () =>
        Effect.sync(() => {
          if (!promptDir) return
          fsNode.mkdirSync(promptDir, { recursive: true })

          function processPromptFile(filepath: string) {
            try {
              const raw = fsNode.readFileSync(filepath, "utf-8")
              const msg: PromptMessage = JSON.parse(raw)
              log.info("external prompt received", { message: msg.message })
              // Publish to bus — bootstrap will pick it up
              Bus.publish(ExternalPrompt, {
                sessionID: SessionID.make(msg.session_id),
                message: msg.message,
              })
              fsNode.unlinkSync(filepath)
            } catch (e) {
              log.error("failed to process prompt", { error: String(e) })
            }
          }

          // Process existing
          if (fsNode.existsSync(promptDir)) {
            for (const f of fsNode.readdirSync(promptDir).filter(f => f.endsWith(".json"))) {
              processPromptFile(path.join(promptDir, f))
            }
          }

          promptWatcher = fsNode.watch(promptDir, (eventType, filename) => {
            if (!filename || !filename.endsWith(".json")) return
            const fp = path.join(promptDir, filename)
            setTimeout(() => {
              if (fsNode.existsSync(fp)) processPromptFile(fp)
            }, 100)
          })

          promptWatcher.on("error", (err) => {
            log.error("prompt watcher error", { error: String(err) })
          })

          log.info("watching prompt directory", { dir: promptDir })
        }),
    }
  }

  const bridgeBase = process.env.OC_BRIDGE_PATH || path.join(require("os").homedir(), ".opencode", "bridge")

  export const layer = Layer.succeed(
    Service,
    Service.of(make(
      path.join(bridgeBase, "incoming", "answer"),
      path.join(bridgeBase, "incoming", "prompt"),
    )),
  )
}
