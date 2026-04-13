import { Deferred, Effect, Exit, Layer, Schedule, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import os from "os"
import type { Bridge } from "./index"

export namespace Incoming {
  const log = Log.create({ service: "bridge.incoming" })

  function bridgeBasePath(): string {
    return process.env.OC_BRIDGE_PATH || path.join(os.homedir(), ".opencode", "bridge")
  }

  function answerDir(): string {
    return path.join(bridgeBasePath(), "incoming", "answer")
  }

  // Pending question trackers
  const pending = new Map<string, Deferred.Deferred<number[]>>()
  let watcher: fsNode.FSWatcher | null = null

  function processAnswerFile(filepath: string): Effect.Effect<void> {
    return Effect.sync(() => {
      try {
        const raw = fsNode.readFileSync(filepath, "utf-8")
        const msg: Bridge.AnswerMessage = JSON.parse(raw)
        const deferred = pending.get(msg.question_id)
        if (deferred) {
          log.info("answer received", { question_id: msg.question_id, selected: msg.selected })
          Deferred.doneUnsafe(deferred, Exit.succeed(msg.selected))
          pending.delete(msg.question_id)
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

  function processExistingAnswers(): Effect.Effect<void> {
    return Effect.sync(() => {
      const dir = answerDir()
      if (!fsNode.existsSync(dir)) return
      const files = fsNode.readdirSync(dir).filter((f) => f.endsWith(".json"))
      for (const file of files) {
        Effect.runSync(processAnswerFile(path.join(dir, file)))
      }
    })
  }

  export interface Interface {
    readonly waitForAnswer: (questionId: string, timeoutMinutes: number) => Effect.Effect<number[]>
    readonly startWatching: () => Effect.Effect<void>
    readonly stopWatching: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/BridgeIncoming") {}

  export const layer = Layer.succeed(
    Service,
    Service.of({
      waitForAnswer: (questionId, timeoutMinutes) =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<number[]>()
          pending.set(questionId, deferred)

          // Check for existing answers first
          yield* processExistingAnswers()

          // Race between answer and timeout
          const timeout = Effect.delay(
            Effect.sync(() => {
              pending.delete(questionId)
              log.info("question timed out", { question_id: questionId })
            }),
            `${timeoutMinutes} minutes` as any,
          )

          // Return deferred result (timeout returns empty array)
          const result = yield* Effect.race(
            Deferred.await(deferred),
            Effect.andThen(timeout, Effect.succeed<number[]>([])),
          )
          return result
        }),

      startWatching: () =>
        Effect.sync(() => {
          const dir = answerDir()
          fsNode.mkdirSync(dir, { recursive: true })

          watcher = fsNode.watch(dir, (eventType, filename) => {
            if (filename && filename.endsWith(".json")) {
              const filepath = path.join(dir, filename)
              if (fsNode.existsSync(filepath)) {
                Effect.runSync(processAnswerFile(filepath))
              }
            }
          })

          log.info("watching answer directory", { dir })
        }),

      stopWatching: () =>
        Effect.sync(() => {
          if (watcher) {
            watcher.close()
            watcher = null
          }
          // Fail all pending
          for (const [id, deferred] of pending) {
            Deferred.doneUnsafe(deferred, Exit.succeed([]))
          }
          pending.clear()
          log.info("stopped watching")
        }),
    }),
  )
}
