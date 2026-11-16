import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Controller, ForbiddenException, Get, HttpCode, Inject, Injectable, NotFoundException, Param, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { ENV, type Env } from '../../env';
import { contentDisposition, DOWNLOAD_SECONDS, type FileStorage, UPLOAD_SECONDS } from './file-storage';

interface Grant {
  /** Storage key */
  k: string;
  /** PUT or GET */
  m: 'PUT' | 'GET';
  /** Expiry, milliseconds since 1970 */
  e: number;
  /** Most bytes allowed (PUT) */
  s?: number;
  /** Content-Disposition (GET) */
  d?: string;
  /** Content-Type (GET) */
  t?: string;
}

/**
 * Keeps files on this computer's disk, for development before R2 is set up.
 * Addresses carry a signed grant, like R2's signed addresses do, and go
 * through the app's own `/api` so the browser can reach them.
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  readonly ready = true;
  private readonly root: string;
  private readonly secret = randomBytes(32);
  /** The time now. Tests replace it. */
  clock: () => number = () => Date.now();

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.LOCAL_FILES_DIR ?? '.localfiles');
  }

  private pathOf(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root)) throw new ForbiddenException('That address is not valid');
    return full;
  }

  private sign(grant: Grant): string {
    const body = Buffer.from(JSON.stringify(grant)).toString('base64url');
    const mac = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `/api/vault/local/${body}.${mac}`;
  }

  /** The grant in a token, if it is genuine, unexpired and for this method. */
  check(token: string, method: 'PUT' | 'GET'): Grant {
    const [body = '', mac = ''] = token.split('.');
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ForbiddenException('That address is not valid');
    }
    const grant = JSON.parse(Buffer.from(body, 'base64url').toString()) as Grant;
    if (grant.m !== method) throw new ForbiddenException('That address is not valid');
    if (grant.e < this.clock()) throw new ForbiddenException('That address has expired');
    return grant;
  }

  async uploadUrl(key: string, mimeType: string, size: number) {
    return {
      url: this.sign({ k: key, m: 'PUT', e: this.clock() + UPLOAD_SECONDS * 1000, s: size }),
      headers: { 'Content-Type': mimeType },
    };
  }

  async downloadUrl(key: string, fileName: string, mimeType: string, inline: boolean): Promise<string> {
    return this.sign({
      k: key,
      m: 'GET',
      e: this.clock() + DOWNLOAD_SECONDS * 1000,
      d: contentDisposition(fileName, inline),
      t: mimeType,
    });
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathOf(key))).size;
    } catch {
      return null;
    }
  }

  async read(key: string, maxBytes: number): Promise<Buffer> {
    const handle = await open(this.pathOf(key), 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async write(key: string, from: NodeJS.ReadableStream): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await pipeline(from, createWriteStream(path));
  }

  stream(key: string): NodeJS.ReadableStream {
    return createReadStream(this.pathOf(key));
  }
}

/** The local storage's signed addresses. The grant in the address is the permission. */
@Controller('vault/local')
export class LocalFilesController {
  constructor(private readonly storage: LocalFileStorage) {}

  @Public()
  @Put(':token')
  @HttpCode(200)
  async put(@Param('token') token: string, @Req() req: Request): Promise<void> {
    const grant = this.storage.check(token, 'PUT');
    const length = Number(req.headers['content-length'] ?? 0);
    if (grant.s !== undefined && length > grant.s) throw new ForbiddenException('That file is larger than was asked for');
    await this.storage.write(grant.k, req);
  }

  @Public()
  @Get(':token')
  async get(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const grant = this.storage.check(token, 'GET');
    if ((await this.storage.size(grant.k)) === null) throw new NotFoundException('That file is not here');
    if (grant.d) res.setHeader('Content-Disposition', grant.d);
    res.setHeader('Content-Type', grant.t ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=60');
    this.storage.stream(grant.k).pipe(res);
  }
}
