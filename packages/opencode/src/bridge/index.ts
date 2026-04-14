import { Effect, Layer, ServiceMap } from "effect"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { makeRuntime } from "@/effect/run-service"
import { Outgoing } from "./outgoing"
import { Incoming as IncomingNS } from "./incoming"
import { Watcher } from "./watcher"
import { Config } from "@/config/config"
import { BusEvent } from "@/bus/bus-event"
import { SessionID } from "@/session/schema"
import z from "zod"

export namespace Bridge {
  const log = Log.create({ service: "bridge" })

  // Types
  export type StatusLevel = "info" | "warning" | "error"

  export interface StatusMessage {
    type: "status"
    level: StatusLevel
    session_id?: string
    agent?: string
    title: string
    message: string
    timestamp: string
  }

  export interface Choice {
    index: number
    label: string
  }

  export interface QuestionMessage {
    type: "question"
    question_id: string
    session_id?: string
    title: string
    message: string
    choices: Choice[]
    multiple: boolean
    timeout_minutes: number
    timestamp: string
  }

  export interface AnswerMessage {
    type: "answer"
    question_id: string
    selected: number[]
    timestamp: string
  }

  // Bus Events for Bridge
  export const Event = {
    StatusSent: BusEvent.define(
      "bridge.status.sent",
      z.object({
        level: z.string(),
        title: z.string(),
      }),
    ),
  }

  // Service Interface
  export interface Interface {
    readonly sendStatus: (input: {
      level: StatusLevel
      title: string
      message: string
      sessionId?: SessionID
      agent?: string
    }) => Effect.Effect<void>
    readonly sendQuestion: (input: {
      questionId: string
      title: string
      message: string
      choices: Choice[]
      sessionId?: SessionID
      multiple?: boolean
      timeoutMinutes?: number
    }) => Effect.Effect<number[]>
    readonly init: () => Effect.Effect<void>
    readonly shutdown: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Bridge") {}

  export const layer: Layer.Layer<Service, never, Config.Service | Bus.Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const configService = yield* Config.Service
      const bus = yield* Bus.Service
      const cfg = yield* configService.get()
      const bridgeConfig = cfg.bridge

      // Resolve base path from config
      const basePath = Watcher.resolveBasePath(bridgeConfig?.path)
      log.info("bridge base path", { basePath })

      // Construct sub-services with the resolved path
      const watcher = Watcher.make(basePath)
      const outgoing = Outgoing.make(basePath)
      const incoming = IncomingNS.make(
        basePath + "/incoming/answer",
        basePath + "/incoming/prompt",
      )

      // --- Session status subscription ---
      const SessionStatusEvent = BusEvent.define(
        "session.status",
        z.object({
          sessionID: SessionID.zod,
          status: z.discriminatedUnion("type", [
            z.object({ type: z.literal("busy") }),
            z.object({ type: z.literal("idle") }),
            z.object({
              type: z.literal("retry"),
              attempt: z.number(),
              message: z.string(),
              next: z.number(),
            }),
          ]),
        }),
      )

      const unsubStatus = yield* bus.subscribeCallback(SessionStatusEvent, (event) => {
        const { sessionID, status } = event.properties
        const statusMap: Record<string, { level: StatusLevel; title: string; message: string }> = {
          busy: { level: "info", title: "任務開始", message: "Processing..." },
          idle: { level: "info", title: "任務完成", message: "Done" },
          retry: {
            level: "warning",
            title: "重試中",
            message: status.type === "retry" ? status.message : "Retrying...",
          },
        }
        const entry = statusMap[status.type]
        if (entry) {
          Effect.runSync(
            outgoing.writeStatus({
              type: "status",
              level: entry.level,
              session_id: sessionID,
              title: entry.title,
              message: entry.message,
              timestamp: new Date().toISOString(),
            }),
          )
        }
      })

      // --- Session error subscription ---
      const SessionErrorEvent = BusEvent.define(
        "session.error",
        z.object({
          sessionID: SessionID.zod.optional(),
          error: z.any(),
        }),
      )

      const unsubError = yield* bus.subscribeCallback(SessionErrorEvent, (event) => {
        const { sessionID, error } = event.properties
        const msg = error?.message ?? String(error)
        Effect.runSync(
          outgoing.writeStatus({
            type: "status",
            level: "error",
            session_id: sessionID,
            title: "任務失敗",
            message: msg,
            timestamp: new Date().toISOString(),
          }),
        )
      })

      // --- Finalizer ---
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          unsubStatus()
          unsubError()
          yield* incoming.stopWatching()
          yield* watcher.removeRunJson()
          log.info("bridge finalized")
        }),
      )

      // --- Service methods ---
      const sendStatus = Effect.fn("Bridge.sendStatus")(function* (input: {
        level: StatusLevel
        title: string
        message: string
        sessionId?: SessionID
        agent?: string
      }) {
        const msg: StatusMessage = {
          type: "status",
          level: input.level,
          session_id: input.sessionId,
          agent: input.agent,
          title: input.title,
          message: input.message,
          timestamp: new Date().toISOString(),
        }
        yield* outgoing.writeStatus(msg)
        log.info("status sent", { level: input.level, title: input.title })
      })

      const sendQuestion = Effect.fn("Bridge.sendQuestion")(function* (input: {
        questionId: string
        title: string
        message: string
        choices: Choice[]
        sessionId?: SessionID
        multiple?: boolean
        timeoutMinutes?: number
      }) {
        const timeoutMinutes = input.timeoutMinutes ?? 30
        const msg: QuestionMessage = {
          type: "question",
          question_id: input.questionId,
          session_id: input.sessionId,
          title: input.title,
          message: input.message,
          choices: input.choices,
          multiple: input.multiple ?? false,
          timeout_minutes: timeoutMinutes,
          timestamp: new Date().toISOString(),
        }
        yield* outgoing.writeQuestion(msg)
        log.info("question sent", { questionId: input.questionId, title: input.title })

        // Wait for answer from incoming
        const answer = yield* incoming.waitForAnswer(input.questionId, timeoutMinutes)
        return answer
      })

      const init = Effect.fn("Bridge.init")(function* () {
        yield* watcher.initDirectories()
        yield* watcher.writeRunJson()
        yield* watcher.cleanStaleMessages()
        yield* incoming.startWatching()
        yield* incoming.startPromptWatcher()
        log.info("bridge initialized")
      })

      const shutdown = Effect.fn("Bridge.shutdown")(function* () {
        yield* incoming.stopWatching()
        yield* watcher.removeRunJson()
        log.info("bridge shutdown")
      })

      return Service.of({ sendStatus, sendQuestion, init, shutdown })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(Bus.layer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function sendStatus(input: {
    level: StatusLevel
    title: string
    message: string
    sessionId?: SessionID
    agent?: string
  }) {
    return runPromise((s) => s.sendStatus(input))
  }

  export async function sendQuestion(input: {
    questionId: string
    title: string
    message: string
    choices: Choice[]
    sessionId?: SessionID
    multiple?: boolean
    timeoutMinutes?: number
  }) {
    return runPromise((s) => s.sendQuestion(input))
  }

  export async function init() {
    return runPromise((s) => s.init())
  }

  export async function shutdown() {
    return runPromise((s) => s.shutdown())
  }
}

// Re-export for ExternalPrompt access
export { Incoming } from "./incoming"
