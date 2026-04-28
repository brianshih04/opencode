import { Bus } from "@/bus"
import { SessionStatus } from "@/session/status"
import { Session } from "@/session"
import { Question } from "@/question"
import { Bridge } from "./index"
import { Log } from "@/util/log"
import { InstanceState } from "@/effect/instance-state"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "bridge-sub" })

let offStatus: (() => void) | undefined
let offError: (() => void) | undefined
let offQuestion: (() => void) | undefined

function errorMsg(err: { name: string; data: Record<string, unknown> } | undefined): string {
  if (!err) return "未知錯誤"
  if ("message" in err.data && typeof err.data.message === "string") return err.data.message
  return err.name
}

export function init() {
  offStatus = Bus.subscribe(SessionStatus.Event.Status, (evt) => {
    const { sessionID, status } = evt.properties
    if (status.type === "busy") {
      Bridge.sendStatus({
        level: "info",
        sessionId: sessionID,
        agent: "primary",
        title: "工作開始",
        message: "OpenCode 正在處理...",
      })
    } else if (status.type === "idle") {
      Bridge.sendStatus({
        level: "info",
        sessionId: sessionID,
        agent: "primary",
        title: "工作完成",
        message: "OpenCode 已回到閒置狀態",
      })
    } else if (status.type === "retry") {
      Bridge.sendStatus({
        level: "warning",
        sessionId: sessionID,
        agent: "primary",
        title: "重試中",
        message: status.message,
      })
    }
  })

  offError = Bus.subscribe(Session.Event.Error, (evt) => {
    const { sessionID, error } = evt.properties
    const statusPayload: Parameters<typeof Bridge.sendStatus>[0] = {
      level: "error",
      agent: "primary",
      title: "錯誤",
      message: errorMsg(error),
    }
    if (sessionID) {
      statusPayload.sessionId = sessionID
    }
    Bridge.sendStatus(statusPayload)
  })

  offQuestion = Bus.subscribe(Question.Event.Asked, (evt) => {
    const req = evt.properties
    const q = req.questions[0]
    if (!q) return

    Bridge.sendQuestion({
      questionId: String(req.id),
      sessionId: req.sessionID,
      title: q.header,
      message: q.question,
      choices: q.options.map((opt, i) => ({ index: i, label: opt.label })),
      multiple: q.multiple ?? false,
      timeoutMinutes: 30,
    })
      .then(async (selected) => {
        const answer = selected.map((idx) => q.options[idx]?.label ?? "")
        await Question.reply({ requestID: req.id, answers: [answer] })
      })
      .catch((err) => {
        log.debug("bridge question failed or timed out", {
          question_id: String(req.id),
          error: String(err),
        })
      })
  })

  log.info("subscribers registered")
}

export function cleanup() {
  offStatus?.()
  offError?.()
  offQuestion?.()
  offStatus = undefined
  offError = undefined
  offQuestion = undefined
  log.info("subscribers cleaned up")
}
