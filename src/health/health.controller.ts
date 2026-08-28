import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import { ApiResponse as ApiResponseInterface } from '../common/interfaces/api-response.interface';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck(): Promise<ApiResponseInterface<{ status: string; timestamp: string }>> {
    const healthData = await this.healthService.checkHealth();
    return {
      status: true,
      message: 'Service is healthy',
      data: healthData,
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
    const detailedHealthData = await this.healthService.checkDetailedHealth();
    return {
      status: true,
      message: 'Detailed health check completed',
      data: detailedHealthData,
    };
  }
} 