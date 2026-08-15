/**
 * Terminal UI domain zod schemas for interactive PTY panel unary methods.
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'

const terminalStatusSchema = z.union([
  z.object({ kind: z.literal('running') }),
  z.object({
    kind: z.literal('exited'),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
  }),
])

const terminalUiSessionViewSchema = z.object({
  terminalSessionId: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z.string().min(1),
  pid: z.number().int().optional(),
  status: terminalStatusSchema,
})

/** terminal.open request payload. */
export const terminalOpenRequestSchema = z.object({
  cwd: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.open'>>>

/** terminal.open response value. */
export const terminalOpenValueSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z.string().min(1),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.open'>>>

/** terminal.list request payload. */
export const terminalListRequestSchema = z.object({
  sessionId: sessionIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.list'>>>

/** terminal.list response value. */
export const terminalListValueSchema = z.object({
  sessions: z.array(terminalUiSessionViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.list'>>>

/** terminal.attach request payload. */
export const terminalAttachRequestSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.attach'>>>

/** terminal.attach response value. */
export const terminalAttachValueSchema = z.object({
  attached: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.attach'>>>

/** terminal.detach request payload. */
export const terminalDetachRequestSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.detach'>>>

/** terminal.detach response value. */
export const terminalDetachValueSchema = z.object({
  detached: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.detach'>>>

const terminalWriteDataSchema = z.union([
  z.object({ text: z.string(), dataBase64: z.string().optional() }),
  z.object({ text: z.string().optional(), dataBase64: z.string().min(1) }),
])

/** terminal.write request payload. */
export const terminalWriteRequestSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
  data: terminalWriteDataSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.write'>>>

/** terminal.write response value. */
export const terminalWriteValueSchema = z.object({
  ok: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.write'>>>

/** terminal.resize request payload. */
export const terminalResizeRequestSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.resize'>>>

/** terminal.resize response value. */
export const terminalResizeValueSchema = z.object({
  ok: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.resize'>>>

/** terminal.close request payload. */
export const terminalCloseRequestSchema = z.object({
  sessionId: sessionIdSchema,
  terminalSessionId: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.close'>>>

/** terminal.close response value. */
export const terminalCloseValueSchema = z.object({
  closed: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.close'>>>
