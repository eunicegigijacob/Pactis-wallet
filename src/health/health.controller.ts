import {
  Request,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiResponse as ApiResponseInterface } from '../common/interfaces/api-response.interface';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor() {}

  @HttpCode(HttpStatus.OK)
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck(): Promise<ApiResponseInterface<{ status: string; timestamp: string }>> {
    return {
      status: true,
      message: 'Service is healthy',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Get('detailed')
  @ApiOperation({ summary: 'Detailed health check endpoint' })
  @ApiResponse({ status: 200, description: 'Detailed health status' })
  async detailedHealthCheck(): Promise<ApiResponseInterface<{
    status: string;
    timestamp: string;
    uptime: number;
    memory: any;
    version: string;
  }>> {
    return {
      status: true,
      message: 'Detailed health check completed',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
      },
    };
  }
} 