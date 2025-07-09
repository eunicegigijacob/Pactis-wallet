import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async checkDetailedHealth(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    memory: any;
    version: string;
  }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
    };
  }
} 