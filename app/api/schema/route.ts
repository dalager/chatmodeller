import { formJsonSchema } from '@/lib/form-schema';

/** The JSON Schema every form definition conforms to. */
export function GET() {
  return Response.json(formJsonSchema());
}
