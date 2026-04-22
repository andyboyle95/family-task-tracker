export const runtime = 'edge'
import { iconResponse } from '@/lib/icon-response'
export function GET() { return iconResponse(512) }
