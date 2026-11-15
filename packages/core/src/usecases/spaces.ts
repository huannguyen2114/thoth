import { type CreateSpaceInput, createSpaceInput, type Space } from "../domain/space";
import type { SpaceRepository } from "../ports/repositories";
import { appError, err, ok, type Result } from "../shared/result";

export interface SpaceDeps {
  spaces: SpaceRepository;
}

/** Validates input at the boundary, then persists. Pattern for every use case. */
export async function createSpace(
  deps: SpaceDeps,
  input: CreateSpaceInput,
): Promise<Result<Space>> {
  const parsed = createSpaceInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("validation", parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  return ok(await deps.spaces.create(parsed.data));
}

export function listSpaces(deps: SpaceDeps): Promise<Space[]> {
  return deps.spaces.list();
}
