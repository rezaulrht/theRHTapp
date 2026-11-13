import { All, Controller, Module, NotFoundException } from '@nestjs/common';

/**
 * Catches every path no other controller handles. Because it is a real route,
 * the session guard runs first: a logged-out caller gets 401 for any path and
 * cannot tell which ones exist. Its module must be imported last.
 */
@Controller()
export class FallbackController {
  @All('*splat')
  notFound(): never {
    throw new NotFoundException();
  }
}

@Module({ controllers: [FallbackController] })
export class FallbackModule {}
