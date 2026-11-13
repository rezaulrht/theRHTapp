import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Settings shared by the real server and the test app. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
