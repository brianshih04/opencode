import z from "zod"

export const StatusLevel = z.enum(["info", "warning", "error"])

export const StatusMessage = z.object({
  type: z.literal("status"),
  level: StatusLevel,
  session_id: z.string(),
  agent: z.string(),
  title: z.string(),
  message: z.string(),
  timestamp: z.string(),
})
export type StatusMessage = z.infer<typeof StatusMessage>

export const QuestionMessage = z.object({
  type: z.literal("question"),
  question_id: z.string(),
  session_id: z.string(),
  title: z.string(),
  message: z.string(),
  choices: z.array(z.object({ index: z.number(), label: z.string() })),
  multiple: z.boolean(),
  timeout_minutes: z.number(),
  timestamp: z.string(),
})
export type QuestionMessage = z.infer<typeof QuestionMessage>

export const AnswerMessage = z.object({
  type: z.literal("answer"),
  question_id: z.string(),
  selected: z.array(z.number()),
  timestamp: z.string(),
})
export type AnswerMessage = z.infer<typeof AnswerMessage>

export const RunInfo = z.object({
  pid: z.number(),
  cwd: z.string(),
  branch: z.string().optional(),
  started_at: z.string(),
})
export type RunInfo = z.infer<typeof RunInfo>
