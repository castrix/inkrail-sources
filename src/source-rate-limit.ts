const createError = (value: any) => Object.assign(new Error(value.statusMessage), value)

export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value) return 60_000
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : 60_000
}

export function sourceRateLimitError(retryAfter: string | null) {
  return createError({
    statusCode: 429,
    statusMessage: 'Source rate limit reached. Please retry after the cooldown.',
    data: { retryAfterMs: retryAfterMilliseconds(retryAfter) }
  })
}

export function isSourceRateLimit(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429)
}
