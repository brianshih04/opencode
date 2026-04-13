import { Deferred, Effect, Layer, Option, Schedule, ServiceMap } from "effect"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { Outgoing } from "./outgoing"
import { Incoming } from "./incoming"
import { Watcher } from "./watcher"
import { SessionID } from "@/session/schema"

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
    }) => Effect.Effect<number[], never, never>
    readonly init: () => Effect.Effect<void>
    readonly shutdown: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Bridge") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const watcher = yield* Watcher.Service
      const outgoing = yield* Outgoing.Service
      const incoming = yield* Incoming.Service

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
    Layer.provide(Watcher.layer),
    Layer.provide(Outgoing.layer),
    Layer.provide(Incoming.layer),
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
