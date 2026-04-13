import { Deferred, Duration, Effect, Exit, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import fsNode from "fs"
import path from "path"
import type { Bridge } from "./index"

interface IncomingState {
  pending: Map<string, Deferred.Deferred<number[]>>
  watcher: fsNode.FSWatcher | null
}

export namespace Incoming {
  const log = Log.create({ service: "bridge.incoming" })

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
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/BridgeIncoming") {}

  export function make(answerDir: string): Interface {
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
          // Resolve all pending with empty array (no answer)
          for (const [, deferred] of state.pending) {
            Deferred.doneUnsafe(deferred, Exit.succeed([]))
          }
          state.pending.clear()
          log.info("stopped watching")
        }),
    }
  }

  export const layer = Layer.succeed(
    Service,
    Service.of(make(
      path.join(
        process.env.OC_BRIDGE_PATH || path.join(require("os").homedir(), ".opencode", "bridge"),
        "incoming",
        "answer",
      ),
    )),
  )
}
