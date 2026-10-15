export function createVerifyHandler(options?: {call?: (op: string, payload: unknown) => Promise<Record<string, unknown>>}): (request: Request) => Promise<Response>;
export const POST: (request: Request) => Promise<Response>;
