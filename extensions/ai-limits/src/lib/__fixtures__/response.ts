export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

export function malformedJsonResponse(status: number): Response {
  return new Response("not json{{{", { status });
}
