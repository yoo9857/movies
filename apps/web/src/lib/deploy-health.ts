/**
 * App Router can flush an HTTP 200 shell before a database-backed Server
 * Component fails. React Flight then records the failure in the response body
 * even though the status can no longer change to 500.
 */
export function streamedRenderProblem(body: string): string | null {
  return /[0-9a-z]+:E\\?\{\\?"digest\\?":/i.test(body)
    ? "contains a streamed server-rendering error"
    : null;
}
