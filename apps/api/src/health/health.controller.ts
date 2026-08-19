import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  // Unauthenticated on purpose — hosting platforms (Railway, Render, uptime
  // monitors) hit this without credentials to decide if the service is alive.
  // Pings the database too since a DB outage should count as unhealthy, not
  // just "the Node process is technically still running".
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
