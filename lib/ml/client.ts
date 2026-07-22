export async function callML<T>(path: string, payload: unknown): Promise<T | null> {
  if (!process.env.ML_API_URL) return null
  try {
    const res = await fetch(`${process.env.ML_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Token': process.env.ML_API_TOKEN ?? '',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}
